import {
  SEVERIDADES,
  type AchadoDto,
  type AchadoResumoDto,
  type Constatacao,
  type ConsultaDeAchados,
  type CorpoDeMudancaDeEstado,
  type EstadoDoAchado as EstadoDoAchadoDto,
  type RespostaDeMudancaDeEstado,
  type RespostaDeRevalidacao,
  type Severidade,
  type TipoDeConstatacao,
} from '@bastion/contratos';
import { ImpressaoDigital, gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { ErroDeAplicacao, naoEncontrado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { exigirPermissao, type Permissao } from '../../contas/dominio/Permissoes';
import type { Filas } from '../../integracoes/filas';
import { ATOR_SISTEMA, Achado } from '../dominio/Achado';
import { RiscoAceito } from '../dominio/RiscoAceito';
import {
  RepositorioDeAchados,
  type ContagemPorSeveridade,
  type FiltroDeAchados,
  type ResumoDeAchado,
} from '../infraestrutura/RepositorioDeAchados';
import { decodificarCursorDeAchados, montarPaginaDeAchados } from './cursor';

export const MENSAGEM_USE_A_REVALIDACAO =
  'Use a revalidação: um achado só é corrigido depois de uma nova avaliação.';
export const MENSAGEM_INICIE_A_CORRECAO = 'Inicie a correção antes de pedir revalidação.';

const PERMISSAO_POR_ESTADO_DE_DESTINO: Partial<Record<EstadoDoAchadoDto, Permissao>> = {
  CONFIRMADO: 'TRIAR_ACHADO',
  REABERTO: 'TRIAR_ACHADO',
  EM_CORRECAO: 'CORRIGIR_ACHADO',
  RISCO_ACEITO: 'ACEITAR_RISCO',
};

const ATOR_DO_SISTEMA_NA_AUDITORIA = { tipo: 'SISTEMA', id: null, nome: 'Bastion' } as const;

export interface PaginaDeAchados {
  itens: AchadoResumoDto[];
  proximaPagina: string | null;
}

export interface ConsultaDeAchadosDaAvaliacao {
  pagina?: string | undefined;
  limite: number;
  severidade?: string | undefined;
}

export type SolicitarAvaliacaoDeRevalidacao = (
  contexto: ContextoDaRequisicao,
  dados: { sistemaId: string; achadoId: string },
) => Promise<{ id: string; estado: string }>;

export const paraResumoDto = (resumo: ResumoDeAchado): AchadoResumoDto => ({
  id: resumo.id,
  sistemaId: resumo.sistemaId,
  sistemaNome: resumo.sistemaNome,
  titulo: resumo.titulo,
  tipo: resumo.tipo as TipoDeConstatacao,
  severidade: resumo.severidade,
  estado: resumo.estado,
  local: resumo.local,
  ocorrencias: resumo.ocorrencias,
  ultimaVezEm: resumo.ultimaVezEm.toISOString(),
});

export const paraAchadoDto = (achado: Achado, sistemaNome: string): AchadoDto => {
  const dados = achado.paraDados();
  return {
    id: dados.id,
    sistemaId: dados.sistemaId,
    sistemaNome,
    titulo: dados.titulo,
    tipo: dados.tipo as TipoDeConstatacao,
    severidade: dados.severidade,
    estado: dados.estado,
    local: dados.local,
    ocorrencias: dados.ocorrencias,
    ultimaVezEm: dados.ultimaVezEm.toISOString(),
    impressaoDigital: dados.impressaoDigital,
    descricao: dados.descricao,
    evidencia: { ...dados.evidencia },
    correcaoSugerida: dados.correcaoSugerida,
    conformidade: { owasp: [...dados.conformidade.owasp], lgpd: [...dados.conformidade.lgpd] },
    primeiraVezEm: dados.primeiraVezEm.toISOString(),
    avaliacaoIds: [...dados.avaliacaoIds],
    riscoAceito:
      dados.riscoAceito === null
        ? null
        : {
            justificativa: dados.riscoAceito.justificativa,
            responsavel: dados.riscoAceito.responsavel,
            validoAte: dados.riscoAceito.validoAte.toISOString(),
          },
    historico: dados.historico.map((entrada) => ({
      em: entrada.em.toISOString(),
      de: entrada.de,
      para: entrada.para,
      ator: entrada.ator,
      comentario: entrada.comentario,
    })),
    transicoesPossiveis: [...achado.transicoesPossiveis],
  };
};

const interpretarSeveridades = (texto: string | undefined): Severidade[] | undefined => {
  if (texto === undefined || texto.trim() === '') return undefined;
  const itens = texto
    .split(',')
    .map((parte) => parte.trim().toUpperCase())
    .filter((parte) => parte !== '');
  const validas = itens.filter((item): item is Severidade =>
    (SEVERIDADES as readonly string[]).includes(item),
  );
  if (validas.length !== itens.length) {
    throw new ErroDeAplicacao(
      400,
      'VALIDACAO',
      `Severidade inválida. Use uma lista separada por vírgula com: ${SEVERIDADES.join(', ')}.`,
    );
  }
  return validas;
};

export class ServicoDeAchados {
  constructor(
    private readonly db: Banco,
    private readonly filas: Filas,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly repositorio = new RepositorioDeAchados(),
  ) {}

  async listar(contexto: ContextoDaRequisicao, consulta: ConsultaDeAchados): Promise<PaginaDeAchados> {
    const severidades = interpretarSeveridades(consulta.severidade);
    const filtro: FiltroDeAchados = {
      incluirFechados: consulta.incluirFechados ?? false,
      limite: consulta.limite,
      ...(severidades ? { severidades } : {}),
      ...(consulta.estado ? { estado: consulta.estado } : {}),
      ...(consulta.sistemaId ? { sistemaId: consulta.sistemaId } : {}),
      ...(consulta.busca?.trim() ? { busca: consulta.busca.trim() } : {}),
    };
    return this.paginar(contexto, filtro, consulta.pagina);
  }

  async listarDaAvaliacao(
    contexto: ContextoDaRequisicao,
    avaliacaoId: string,
    consulta: ConsultaDeAchadosDaAvaliacao,
  ): Promise<PaginaDeAchados> {
    const severidades = interpretarSeveridades(consulta.severidade);
    const filtro: FiltroDeAchados = {
      incluirFechados: true,
      avaliacaoId,
      limite: consulta.limite,
      ...(severidades ? { severidades } : {}),
    };
    return this.paginar(contexto, filtro, consulta.pagina);
  }

  async obter(contexto: ContextoDaRequisicao, id: string): Promise<AchadoDto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const encontrado = await this.repositorio.buscarPorId(tx, id);
      if (!encontrado) throw naoEncontrado('Achado');
      return paraAchadoDto(encontrado.achado, encontrado.sistemaNome);
    });
  }

  async mudarEstado(
    contexto: ContextoDaRequisicao,
    id: string,
    corpo: CorpoDeMudancaDeEstado,
  ): Promise<RespostaDeMudancaDeEstado> {
    if (corpo.estado === 'CORRIGIDO' || corpo.estado === 'REVALIDANDO') {
      throw new ErroDeAplicacao(422, 'USE_A_REVALIDACAO', MENSAGEM_USE_A_REVALIDACAO);
    }
    const permissao = PERMISSAO_POR_ESTADO_DE_DESTINO[corpo.estado];
    if (permissao) exigirPermissao(contexto.papel, permissao);

    const agora = this.relogio.agora();
    const resultado = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const encontrado = await this.repositorio.buscarPorId(tx, id, true);
      if (!encontrado) throw naoEncontrado('Achado');
      const { achado } = encontrado;
      const estadoAnterior = achado.estado;
      const risco =
        corpo.estado === 'RISCO_ACEITO' && corpo.riscoAceito
          ? RiscoAceito.criar(
              {
                justificativa: corpo.riscoAceito.justificativa,
                responsavel: corpo.riscoAceito.responsavel,
                validoAte: new Date(corpo.riscoAceito.validoAte),
              },
              agora,
            )
          : undefined;
      achado.mudarEstado(
        corpo.estado,
        {
          ator: contexto.ator.nome,
          ...(corpo.comentario?.trim() ? { comentario: corpo.comentario.trim() } : {}),
          ...(risco ? { riscoAceito: risco } : {}),
        },
        agora,
      );
      await this.repositorio.salvar(tx, achado, agora);
      const dados = achado.paraDados();
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: corpo.estado === 'RISCO_ACEITO' ? 'RISCO_ACEITO' : 'ACHADO_ESTADO_ALTERADO',
        alvo: dados.titulo,
        detalhe: {
          achadoId: dados.id,
          de: estadoAnterior,
          para: achado.estado,
          ...(corpo.comentario?.trim() ? { comentario: corpo.comentario.trim() } : {}),
          ...(risco
            ? { responsavel: risco.responsavel, validoAte: risco.validoAte.toISOString() }
            : {}),
        },
      });
      await registrarNoOutbox(tx, achado.puxarEventos());
      return { estado: achado.estado, validoAte: risco?.validoAte };
    });

    if (resultado.validoAte) {
      await this.filas.agendarVigilancia(
        { tipo: 'vencimento-do-risco', achadoId: id, organizacaoId: contexto.organizacaoId },
        Math.max(0, resultado.validoAte.getTime() - agora.getTime()),
      );
    }
    return { estado: resultado.estado };
  }

  /**
   * Pede a nova avaliação PRIMEIRO (falhas, como sistema não verificado, não deixam rastro) e só
   * depois move o achado para REVALIDANDO.
   */
  async revalidar(
    contexto: ContextoDaRequisicao,
    id: string,
    solicitarAvaliacao: SolicitarAvaliacaoDeRevalidacao,
  ): Promise<RespostaDeRevalidacao> {
    exigirPermissao(contexto.papel, 'CORRIGIR_ACHADO');
    const sistemaId = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const encontrado = await this.repositorio.buscarPorId(tx, id);
      if (!encontrado) throw naoEncontrado('Achado');
      if (encontrado.achado.estado !== 'EM_CORRECAO') {
        throw new ErroDeAplicacao(422, 'INICIE_A_CORRECAO', MENSAGEM_INICIE_A_CORRECAO);
      }
      return encontrado.achado.sistemaId;
    });

    const avaliacao = await solicitarAvaliacao(contexto, { sistemaId, achadoId: id });

    const agora = this.relogio.agora();
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const encontrado = await this.repositorio.buscarPorId(tx, id, true);
      if (!encontrado) throw naoEncontrado('Achado');
      const { achado } = encontrado;
      achado.solicitarRevalidacao(contexto.ator.nome, null, agora);
      await this.repositorio.salvar(tx, achado, agora);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'ACHADO_ESTADO_ALTERADO',
        alvo: achado.paraDados().titulo,
        detalhe: { achadoId: id, de: 'EM_CORRECAO', para: 'REVALIDANDO', avaliacaoId: avaliacao.id },
      });
      await registrarNoOutbox(tx, achado.puxarEventos());
    });
    return { avaliacaoId: avaliacao.id };
  }

  // ---- Chamados pelo contexto de avaliações (com a transação dele, já no contexto da organização).

  async registrarConstatacao(
    tx: Transacao,
    entrada: {
      organizacaoId: string;
      sistemaId: string;
      avaliacaoId: string;
      constatacao: Constatacao;
    },
  ): Promise<AchadoResumoDto> {
    const agora = this.relogio.agora();
    const { organizacaoId, sistemaId, avaliacaoId, constatacao } = entrada;
    const impressao = ImpressaoDigital.de(sistemaId, constatacao.tipo, constatacao.local).valor;
    const existente = await this.repositorio.buscarPorImpressao(tx, impressao);

    let achado: Achado;
    if (existente) {
      achado = existente;
      achado.registrarNovaOcorrencia(avaliacaoId, agora);
      await this.repositorio.salvar(tx, achado, agora);
    } else {
      achado = Achado.detectar(
        { id: gerarIdentificador(), organizacaoId, sistemaId, avaliacaoId, constatacao },
        agora,
      );
      await this.repositorio.inserir(tx, achado, agora);
    }
    await registrarNoOutbox(tx, achado.puxarEventos());

    const dados = achado.paraDados();
    return paraResumoDto({
      id: dados.id,
      sistemaId: dados.sistemaId,
      sistemaNome: await this.repositorio.nomeDoSistema(tx, sistemaId),
      titulo: dados.titulo,
      tipo: dados.tipo,
      severidade: dados.severidade,
      estado: dados.estado,
      local: dados.local,
      ocorrencias: dados.ocorrencias,
      ultimaVezEm: dados.ultimaVezEm,
    });
  }

  /** O achado foi "encontrado novamente" se tem ocorrência na avaliação de revalidação. */
  async concluirRevalidacao(
    tx: Transacao,
    entrada: { achadoId: string; avaliacaoId: string },
  ): Promise<void> {
    const agora = this.relogio.agora();
    const encontrado = await this.repositorio.buscarPorId(tx, entrada.achadoId, true);
    if (!encontrado) return;
    const { achado } = encontrado;
    // Já tratado (reprocessamento) ou o estado mudou: nada a concluir.
    if (achado.estado !== 'REVALIDANDO') return;
    const encontradoNovamente = await this.repositorio.temOcorrenciaNaAvaliacao(
      tx,
      entrada.achadoId,
      entrada.avaliacaoId,
    );
    achado.concluirRevalidacao(encontradoNovamente, ATOR_SISTEMA, agora);
    await this.repositorio.salvar(tx, achado, agora);
    await this.auditoria.registrar(tx, {
      organizacaoId: achado.organizacaoId,
      ator: ATOR_DO_SISTEMA_NA_AUDITORIA,
      acao: 'ACHADO_ESTADO_ALTERADO',
      alvo: achado.paraDados().titulo,
      detalhe: {
        achadoId: entrada.achadoId,
        de: 'REVALIDANDO',
        para: achado.estado,
        avaliacaoId: entrada.avaliacaoId,
      },
    });
    await registrarNoOutbox(tx, achado.puxarEventos());
  }

  contagemDaAvaliacao(tx: Transacao, avaliacaoId: string): Promise<ContagemPorSeveridade> {
    return this.repositorio.contarEmAbertoDaAvaliacao(tx, avaliacaoId);
  }

  contagemEmAbertoPorSeveridade(tx: Transacao): Promise<ContagemPorSeveridade> {
    return this.repositorio.contarEmAbertoPorSeveridade(tx);
  }

  async listarCriticosEAltosEmAberto(tx: Transacao, limite: number): Promise<AchadoResumoDto[]> {
    const linhas = await this.repositorio.listar(tx, {
      severidades: ['CRITICA', 'ALTA'],
      incluirFechados: false,
      limite,
    });
    return linhas.map(paraResumoDto);
  }

  /** Chamado pela vigilância (job atrasado): abre a própria transação. */
  async verificarVencimentoDoRisco(organizacaoId: string, achadoId: string): Promise<void> {
    const agora = this.relogio.agora();
    await emContextoDaOrganizacao(this.db, organizacaoId, async (tx) => {
      const encontrado = await this.repositorio.buscarPorId(tx, achadoId, true);
      if (!encontrado) return;
      const { achado } = encontrado;
      if (!achado.verificarVencimentoDoRisco(agora)) return;
      await this.repositorio.salvar(tx, achado, agora);
      await this.auditoria.registrar(tx, {
        organizacaoId,
        ator: ATOR_DO_SISTEMA_NA_AUDITORIA,
        acao: 'ACHADO_ESTADO_ALTERADO',
        alvo: achado.paraDados().titulo,
        detalhe: { achadoId, de: 'RISCO_ACEITO', para: achado.estado, motivo: 'Aceite de risco vencido' },
      });
      await registrarNoOutbox(tx, achado.puxarEventos());
    });
  }

  private async paginar(
    contexto: ContextoDaRequisicao,
    filtro: FiltroDeAchados,
    cursor: string | undefined,
  ): Promise<PaginaDeAchados> {
    const depoisDe = cursor ? decodificarCursorDeAchados(cursor) : undefined;
    const linhas = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, (tx) =>
      this.repositorio.listar(tx, {
        ...filtro,
        limite: filtro.limite + 1,
        ...(depoisDe ? { depoisDe } : {}),
      }),
    );
    const pagina = montarPaginaDeAchados(linhas, filtro.limite);
    return { itens: pagina.itens.map(paraResumoDto), proximaPagina: pagina.proximaPagina };
  }
}
