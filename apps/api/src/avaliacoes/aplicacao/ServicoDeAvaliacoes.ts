import type {
  AvaliacaoDto,
  ConsultaDeAvaliacoes,
  CorpoDeSolicitacaoDeAvaliacao,
  OrigemDaAvaliacao,
  RequisicaoDoGuardiaoDto,
  RespostaDeParada,
  RespostaDeSolicitacao,
  TarefaExecutarAvaliacao,
} from '@bastion/contratos';
import { ErroDeDominio, gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { Cifragem } from '../../compartilhado/cifragem';
import type { ServicoDeAchados } from '../../achados/aplicacao/ServicoDeAchados';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import { decodificarCursor, montarPagina } from '../../auditoria/aplicacao/paginacao';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { ErroDeAplicacao, naoEncontrado } from '../../compartilhado/erros';
import {
  registrarManipuladorDoOutbox,
  registrarNoOutbox,
  type EventoDoOutbox,
} from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import type { Filas } from '../../integracoes/filas';
import type { ServicoDeRelatorios } from '../../relatorios/aplicacao/ServicoDeRelatorios';
import type { Sistema } from '../../sistemas/dominio/Sistema';
import type { ServicoDeSistemas } from '../../sistemas/aplicacao/ServicoDeSistemas';
import { Agenda } from '../dominio/Agenda';
import { Avaliacao } from '../dominio/Avaliacao';
import { ehEstadoFinalDaAvaliacao } from '../dominio/EstadoDaAvaliacao';
import { AutorizacaoDeTeste } from '../dominio/AutorizacaoDeTeste';
import {
  caminhosExcluidosPadrao,
  metodosDoPerfil,
  tempoMaximoDeExecucaoMs,
  tetoDeRequisicoes,
} from '../dominio/PerfilDeAvaliacao';
import type { AoVivo } from '../infraestrutura/ao-vivo';
import { RepositorioDeAvaliacoes } from '../infraestrutura/RepositorioDeAvaliacoes';
import { paraAvaliacaoDto } from './paraAvaliacaoDto';

export const MENSAGEM_DE_FILA_INDISPONIVEL = 'Fila indisponível; tente novamente.';
export const NOTA_MINIMA_PADRAO = 70;
const MINUTO_EM_MS = 60_000;
/** Mesmo limite da preparação no domínio (`Avaliacao.verificarTempoLimite`). */
const TEMPO_DA_PREPARACAO_EM_MS = 20 * MINUTO_EM_MS;
/** Folga para o job de vigilância disparar depois do limite, nunca antes. */
const FOLGA_DA_VIGILANCIA_EM_MS = 1000;

export const ATOR_SISTEMA = { tipo: 'SISTEMA', id: null, nome: 'Bastion' } as const;

export const origemDaSolicitacao = (
  contexto: ContextoDaRequisicao,
  cabecalhoDeOrigem: string | undefined,
): OrigemDaAvaliacao => {
  if (contexto.ator.tipo !== 'CHAVE_DE_API') return 'WEB';
  return cabecalhoDeOrigem?.trim().toUpperCase() === 'CI' ? 'CI' : 'API';
};

interface DadosDaCriacao {
  sistemaId: string;
  perfil: CorpoDeSolicitacaoDeAvaliacao['perfil'];
  /** Quando ausente: a nota mínima da última avaliação do sistema, ou 70. */
  notaMinima?: number;
  origem: OrigemDaAvaliacao;
  achadoRevalidadoId?: string;
  autorizacao?: { responsavel: string; referencia: string } | undefined;
  permitirCriacaoDeDados?: boolean;
}

export class ServicoDeAvaliacoes {
  constructor(
    private readonly db: Banco,
    private readonly filas: Filas,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly sistemas: ServicoDeSistemas,
    private readonly achados: ServicoDeAchados,
    private readonly relatorios: ServicoDeRelatorios,
    private readonly aoVivo: AoVivo,
    private readonly cifragem: Cifragem,
    readonly repositorio = new RepositorioDeAvaliacoes(),
  ) {}

  /** Liga o serviço ao outbox: quando um sistema é verificado, libera as avaliações que esperavam. */
  registrarManipuladores(): void {
    registrarManipuladorDoOutbox(
      'SistemaVerificado',
      (evento) => this.liberarAvaliacoesDoSistema(evento),
      'avaliacoes',
    );
  }

  async solicitar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeSolicitacaoDeAvaliacao,
    cabecalhoDeOrigem?: string,
  ): Promise<RespostaDeSolicitacao> {
    return this.criar(contexto, {
      sistemaId: corpo.sistemaId,
      perfil: corpo.perfil,
      notaMinima: corpo.notaMinima,
      origem: origemDaSolicitacao(contexto, cabecalhoDeOrigem),
      autorizacao: corpo.autorizacao,
      permitirCriacaoDeDados: corpo.permitirCriacaoDeDados,
    });
  }

  /** Usado pelos achados: revalida um achado com uma avaliação PASSIVA do sistema dele. */
  async solicitarParaRevalidacao(
    contexto: ContextoDaRequisicao,
    entrada: { sistemaId: string; achadoId: string },
  ): Promise<{ id: string; estado: RespostaDeSolicitacao['estado'] }> {
    return this.criar(contexto, {
      sistemaId: entrada.sistemaId,
      perfil: 'PASSIVO',
      origem: origemDaSolicitacao(contexto, undefined),
      achadoRevalidadoId: entrada.achadoId,
    });
  }

  async listar(
    contexto: ContextoDaRequisicao,
    consulta: ConsultaDeAvaliacoes,
  ): Promise<{ itens: AvaliacaoDto[]; proximaPagina: string | null }> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const encontradas = await this.repositorio.listar(tx, contexto.organizacaoId, {
        sistemaId: consulta.sistemaId,
        estado: consulta.estado,
        depoisDe: consulta.pagina ? decodificarCursor(consulta.pagina) : undefined,
        limite: consulta.limite + 1,
      });
      const pagina = montarPagina(encontradas, consulta.limite, (avaliacao) => ({
        em: avaliacao.paraDados().solicitadaEm,
        id: avaliacao.id,
      }));
      return { itens: await this.montarDtos(tx, pagina.itens), proximaPagina: pagina.proximaPagina };
    });
  }

  async obter(contexto: ContextoDaRequisicao, id: string): Promise<AvaliacaoDto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const avaliacao = await this.repositorio.buscarPorId(tx, contexto.organizacaoId, id);
      if (!avaliacao) throw naoEncontrado('Avaliação');
      return this.montarDto(tx, avaliacao);
    });
  }

  /** O log do Guardião, na ordem em que as requisições aconteceram. */
  async requisicoes(
    contexto: ContextoDaRequisicao,
    id: string,
  ): Promise<RequisicaoDoGuardiaoDto[]> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const avaliacao = await this.repositorio.buscarPorId(tx, contexto.organizacaoId, id);
      if (!avaliacao) throw naoEncontrado('Avaliação');
      const linhas = await this.repositorio.listarRequisicoes(tx, contexto.organizacaoId, id);
      return linhas.map((linha) => ({
        id: linha.id,
        em: linha.em.toISOString(),
        metodo: linha.metodo,
        url: linha.url,
        decisao: linha.decisao,
        motivo: linha.motivo,
        status: linha.status,
      }));
    });
  }

  async parar(contexto: ContextoDaRequisicao, id: string): Promise<RespostaDeParada> {
    const agora = this.relogio.agora();
    const dto = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const avaliacao = await this.repositorio.buscarPorId(tx, contexto.organizacaoId, id, true);
      if (!avaliacao) throw naoEncontrado('Avaliação');
      avaliacao.cancelar(agora, contexto.ator.nome);
      await this.repositorio.salvar(tx, avaliacao);
      await registrarNoOutbox(tx, avaliacao.puxarEventos());
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'AVALIACAO_CANCELADA',
        alvo: await this.alvoDaAuditoria(tx, avaliacao),
        detalhe: { avaliacaoId: avaliacao.id, sistemaId: avaliacao.sistemaId },
      });
      return this.montarDto(tx, avaliacao);
    });
    // O estado já está gravado: o sinal ao worker e o ao vivo são melhor esforço.
    await this.tentar('sinalizar o cancelamento ao worker', () =>
      this.filas.sinalizarCancelamento(id),
    );
    await this.publicar(dto);
    return { estado: 'CANCELADA' };
  }

  /**
   * Chamado pela vigilância. Falha a avaliação que estourou o tempo; se ainda há prazo, agenda
   * nova verificação para o instante em que o limite do estado atual vencer.
   */
  async verificarTempoLimite(organizacaoId: string, avaliacaoId: string): Promise<void> {
    const agora = this.relogio.agora();
    const resultado = await emContextoDaOrganizacao(this.db, organizacaoId, async (tx) => {
      const avaliacao = await this.repositorio.buscarPorId(tx, organizacaoId, avaliacaoId, true);
      if (!avaliacao || ehEstadoFinalDaAvaliacao(avaliacao.estado)) return null;
      if (avaliacao.verificarTempoLimite(agora)) {
        await this.persistirFalha(tx, avaliacao);
        return { falhou: true as const, dto: await this.montarDto(tx, avaliacao) };
      }
      return { falhou: false as const, proximaEmMs: this.proximaVerificacaoEmMs(avaliacao, agora) };
    });
    if (resultado === null) return;
    if (resultado.falhou) {
      await this.tentar('sinalizar o cancelamento ao worker', () =>
        this.filas.sinalizarCancelamento(avaliacaoId),
      );
      await this.publicar(resultado.dto);
      return;
    }
    if (resultado.proximaEmMs !== null) {
      await this.filas.agendarVigilancia(
        { tipo: 'tempo-limite-da-avaliacao', avaliacaoId, organizacaoId },
        resultado.proximaEmMs,
      );
    }
  }

  // --- Auxiliares usados pelos manipuladores dos eventos do worker -------------------------

  async montarDto(tx: Transacao, avaliacao: Avaliacao, nomes?: Map<string, string>): Promise<AvaliacaoDto> {
    const mapaDeNomes =
      nomes ?? (await this.repositorio.nomesDosSistemas(tx, [avaliacao.sistemaId]));
    return paraAvaliacaoDto(avaliacao, {
      sistemaNome: mapaDeNomes.get(avaliacao.sistemaId) ?? '',
      relatorioId: await this.relatorios.idDoRelatorioDaAvaliacao(tx, avaliacao.id),
      contagemDeAchados: await this.achados.contagemDaAvaliacao(tx, avaliacao.id),
    });
  }

  async montarDtos(tx: Transacao, avaliacoes: readonly Avaliacao[]): Promise<AvaliacaoDto[]> {
    const nomes = await this.repositorio.nomesDosSistemas(
      tx,
      avaliacoes.map((avaliacao) => avaliacao.sistemaId),
    );
    const dtos: AvaliacaoDto[] = [];
    for (const avaliacao of avaliacoes) dtos.push(await this.montarDto(tx, avaliacao, nomes));
    return dtos;
  }

  /** Resumo para o painel: quantas estão em andamento e as mais recentes. */
  async resumoParaOPainel(
    tx: Transacao,
    organizacaoId: string,
    limite: number,
  ): Promise<{ emAndamento: number; recentes: AvaliacaoDto[] }> {
    const emAndamento = await this.repositorio.contarEmAndamento(tx, organizacaoId);
    const recentes = await this.repositorio.listar(tx, organizacaoId, { limite });
    return { emAndamento, recentes: await this.montarDtos(tx, recentes) };
  }

  /** Grava a falha já aplicada ao agregado: estado, outbox (dispara webhooks) e auditoria. */
  async persistirFalha(tx: Transacao, avaliacao: Avaliacao): Promise<void> {
    const motivo = avaliacao.paraDados().motivoDaFalha;
    await this.repositorio.salvar(tx, avaliacao);
    await registrarNoOutbox(tx, avaliacao.puxarEventos());
    await this.auditoria.registrar(tx, {
      organizacaoId: avaliacao.organizacaoId,
      ator: ATOR_SISTEMA,
      acao: 'AVALIACAO_FALHOU',
      alvo: await this.alvoDaAuditoria(tx, avaliacao),
      detalhe: { avaliacaoId: avaliacao.id, sistemaId: avaliacao.sistemaId, motivo },
    });
  }

  async alvoDaAuditoria(tx: Transacao, avaliacao: Avaliacao): Promise<string> {
    const nomes = await this.repositorio.nomesDosSistemas(tx, [avaliacao.sistemaId]);
    return nomes.get(avaliacao.sistemaId) ?? avaliacao.id;
  }

  /** Publica no acompanhamento ao vivo; falha de Redis não pode desfazer o que já foi gravado. */
  async publicar(dto: AvaliacaoDto): Promise<void> {
    await this.tentar('publicar o acompanhamento ao vivo', () =>
      this.aoVivo.publicarAoVivo(dto.id, { tipo: 'avaliacao', dados: dto }),
    );
  }

  // --- Internos ------------------------------------------------------------------------------

  private async criar(
    contexto: ContextoDaRequisicao,
    dados: DadosDaCriacao,
  ): Promise<{ id: string; estado: RespostaDeSolicitacao['estado'] }> {
    const agora = this.relogio.agora();
    const { avaliacao, tarefa } = await emContextoDaOrganizacao(
      this.db,
      contexto.organizacaoId,
      async (tx) => {
        const sistema = await this.sistemas.obterParaAvaliacao(tx, dados.sistemaId);
        const notaMinima =
          dados.notaMinima ??
          (await this.repositorio.notaMinimaDaUltimaAvaliacao(tx, sistema.id)) ??
          NOTA_MINIMA_PADRAO;
        const permitirCriacaoDeDados = dados.perfil === 'COMPLETO' && dados.permitirCriacaoDeDados === true;
        this.exigirPerfilAplicavel(sistema, dados.perfil, agora);
        const nova = Avaliacao.solicitar(
          {
            id: gerarIdentificador(),
            organizacaoId: contexto.organizacaoId,
            sistemaId: sistema.id,
            perfil: dados.perfil,
            agenda: Agenda.unica(),
            notaMinima,
            origem: dados.origem,
            solicitadaPor: contexto.ator.nome,
            sistemaVerificado: sistema.estaVerificado(agora),
            achadoRevalidadoId: dados.achadoRevalidadoId ?? null,
            ...(dados.autorizacao
              ? { autorizacao: AutorizacaoDeTeste.criar(dados.autorizacao, agora) }
              : {}),
            permitirCriacaoDeDados,
          },
          agora,
        );
        await this.repositorio.inserir(tx, nova);
        await this.auditoria.registrar(tx, {
          organizacaoId: contexto.organizacaoId,
          ator: contexto.ator,
          acao: 'AVALIACAO_SOLICITADA',
          alvo: sistema.nome,
          detalhe: {
            avaliacaoId: nova.id,
            sistemaId: sistema.id,
            perfil: nova.perfil,
            origem: dados.origem,
            estado: nova.estado,
            achadoRevalidadoId: dados.achadoRevalidadoId ?? null,
            autorizadaPor: nova.autorizacao?.responsavel ?? null,
            referenciaDaAutorizacao: nova.autorizacao?.referencia ?? null,
            permitirCriacaoDeDados,
          },
        });
        await registrarNoOutbox(tx, nova.puxarEventos());
        return { avaliacao: nova, tarefa: this.montarTarefa(nova, sistema) };
      },
    );

    // Só depois do commit: o worker precisa enxergar a avaliação gravada.
    if (avaliacao.estado === 'NA_FILA') await this.enfileirar(tarefa);
    return { id: avaliacao.id, estado: avaliacao.estado };
  }

  /**
   * Monta a tarefa do worker. Os segredos (credencial de teste no COMPLETO, cabeçalhos do conector
   * no IA) são decifrados aqui e seguem só na fila; nunca vão para log, auditoria ou DTO.
   * COMPLETO sem credencial cadastrada roda sem autenticação.
   */
  private montarTarefa(avaliacao: Avaliacao, sistema: Sistema): TarefaExecutarAvaliacao {
    const perfil = avaliacao.perfil;
    const tarefa: TarefaExecutarAvaliacao = {
      avaliacaoId: avaliacao.id,
      organizacaoId: avaliacao.organizacaoId,
      sistemaId: sistema.id,
      perfil,
      urlDeHomologacao: sistema.urlDeHomologacao,
      escopo: {
        ...sistema.escopo().paraDados(),
        tempoMaximoMs: tempoMaximoDeExecucaoMs(perfil),
        metodosPermitidos: metodosDoPerfil(perfil),
        caminhosExcluidos: caminhosExcluidosPadrao(),
        tetoDeRequisicoes: tetoDeRequisicoes(perfil),
        permitirCriacaoDeDados: perfil === 'COMPLETO' && avaliacao.permitirCriacaoDeDados,
      },
    };
    try {
      const credencial = sistema.credencialDeTeste;
      if (perfil === 'COMPLETO' && credencial) {
        tarefa.credencialDeTeste = {
          modo: credencial.modo,
          urlDeLogin: credencial.urlDeLogin,
          campoUsuario: credencial.campoUsuario,
          campoSenha: credencial.campoSenha,
          usuario: this.cifragem.decifrar(credencial.segredoUsuarioCifrado),
          senha: this.cifragem.decifrar(credencial.segredoSenhaCifrado),
          indicadorDeSucesso: credencial.indicadorDeSucesso,
        };
      }
      const conector = sistema.conectorDeIa;
      if (perfil === 'IA' && conector) {
        tarefa.conectorDeIa = {
          url: conector.url,
          ...(conector.cabecalhosCifrados === null
            ? {}
            : {
                cabecalhos: JSON.parse(
                  this.cifragem.decifrar(conector.cabecalhosCifrados),
                ) as Record<string, string>,
              }),
          modeloDoCorpo: conector.modeloDoCorpo,
          caminhoDaResposta: conector.caminhoDaResposta,
          frasesSigilosas: [...conector.frasesSigilosas],
        };
      }
    } catch {
      throw new ErroDeDominio(
        'Não foi possível ler os segredos do sistema; cadastre novamente a credencial ou o conector.',
        'SEGREDO_ILEGIVEL',
      );
    }
    return tarefa;
  }

  /** Perfis ativos dependem de configuração do sistema; devolve 422 com o motivo quando falta. */
  private exigirPerfilAplicavel(
    sistema: Sistema,
    perfil: DadosDaCriacao['perfil'],
    agora: Date,
  ): void {
    if (perfil === 'IA') {
      if (sistema.tipo !== 'APP_COM_IA') {
        throw new ErroDeDominio(
          'O perfil IA só se aplica a sistemas do tipo app com IA.',
          'PERFIL_INDISPONIVEL',
        );
      }
      if (sistema.conectorDeIa === null) {
        throw new ErroDeDominio(
          'Configure o conector de IA antes de avaliar com o perfil IA.',
          'PERFIL_INDISPONIVEL',
        );
      }
    }
    // A propriedade não verificada não bloqueia: a avaliação espera a verificação (AGUARDANDO_VERIFICACAO).
    const aptidao = sistema.podeAvaliarComPerfil(perfil, agora);
    if (!aptidao.ok && sistema.estaVerificado(agora)) {
      throw new ErroDeDominio(aptidao.motivo ?? 'Perfil indisponível.', 'PERFIL_INDISPONIVEL');
    }
  }

  /**
   * Enfileira para o worker e agenda as vigilâncias de prazo. Se a fila falhar, a avaliação é
   * marcada como FALHOU e o erro vira 503.
   */
  private async enfileirar(tarefa: TarefaExecutarAvaliacao): Promise<void> {
    try {
      await this.filas.enfileirarAvaliacao(tarefa);
    } catch (erro) {
      console.error('Falha ao enfileirar a avaliação.', erro);
      await this.falharPorFilaIndisponivel(tarefa.organizacaoId, tarefa.avaliacaoId);
      throw new ErroDeAplicacao(503, 'FILA_INDISPONIVEL', MENSAGEM_DE_FILA_INDISPONIVEL);
    }
    const base = {
      tipo: 'tempo-limite-da-avaliacao',
      avaliacaoId: tarefa.avaliacaoId,
      organizacaoId: tarefa.organizacaoId,
    } as const;
    // A vigilância é rede de segurança: se não agendar, a avaliação segue normalmente.
    await this.tentar('agendar a vigilância da avaliação', () =>
      this.filas.agendarVigilancia(base, TEMPO_DA_PREPARACAO_EM_MS),
    );
    await this.tentar('agendar a vigilância da avaliação', () =>
      this.filas.agendarVigilancia(
        base,
        tarefa.escopo.tempoMaximoMs + MINUTO_EM_MS,
      ),
    );
  }

  private async falharPorFilaIndisponivel(organizacaoId: string, avaliacaoId: string): Promise<void> {
    const agora = this.relogio.agora();
    const dto = await emContextoDaOrganizacao(this.db, organizacaoId, async (tx) => {
      const avaliacao = await this.repositorio.buscarPorId(tx, organizacaoId, avaliacaoId, true);
      if (!avaliacao || ehEstadoFinalDaAvaliacao(avaliacao.estado)) return null;
      // O domínio não permite NA_FILA -> FALHOU direto; passa por PREPARANDO, que nunca chegou a existir.
      if (avaliacao.estado === 'NA_FILA') avaliacao.iniciarPreparacao(agora);
      avaliacao.falhar(MENSAGEM_DE_FILA_INDISPONIVEL, agora);
      await this.persistirFalha(tx, avaliacao);
      return this.montarDto(tx, avaliacao);
    });
    if (dto) await this.publicar(dto);
  }

  private proximaVerificacaoEmMs(avaliacao: Avaliacao, agora: Date): number | null {
    let limite: number;
    if (avaliacao.estado === 'PREPARANDO') limite = TEMPO_DA_PREPARACAO_EM_MS;
    else if (avaliacao.estado === 'EM_EXECUCAO') limite = tempoMaximoDeExecucaoMs(avaliacao.perfil);
    else return null;
    const vence = avaliacao.estadoDesde.getTime() + limite + FOLGA_DA_VIGILANCIA_EM_MS;
    return Math.max(FOLGA_DA_VIGILANCIA_EM_MS, vence - agora.getTime());
  }

  private async liberarAvaliacoesDoSistema(evento: EventoDoOutbox): Promise<void> {
    const sistemaId = evento.dados['sistemaId'];
    if (typeof sistemaId !== 'string') return;
    const agora = this.relogio.agora();
    const tarefas = await emContextoDaOrganizacao(this.db, evento.organizacaoId, async (tx) => {
      const sistema = await this.sistemas.obterParaAvaliacao(tx, sistemaId);
      if (!sistema.estaVerificado(agora)) return [];
      const pendentes = await this.repositorio.listarAguardandoVerificacao(
        tx,
        evento.organizacaoId,
        sistemaId,
      );
      const liberadas: TarefaExecutarAvaliacao[] = [];
      for (const avaliacao of pendentes) {
        avaliacao.liberarParaFila(agora);
        await this.repositorio.salvar(tx, avaliacao);
        liberadas.push(this.montarTarefa(avaliacao, sistema));
      }
      return liberadas;
    });
    // O estado já foi gravado: uma falha de fila marca a avaliação como FALHOU e não deve
    // repetir o evento do outbox (as demais avaliações ficariam sem ser enfileiradas).
    for (const tarefa of tarefas) {
      await this.tentar('enfileirar a avaliação liberada', () => this.enfileirar(tarefa));
    }
  }

  private async tentar(oQue: string, acao: () => Promise<unknown>): Promise<void> {
    try {
      await acao();
    } catch (erro) {
      console.error(`Não foi possível ${oQue}.`, erro);
    }
  }
}
