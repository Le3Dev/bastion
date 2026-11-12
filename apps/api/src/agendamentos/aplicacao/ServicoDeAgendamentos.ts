import type {
  AgendamentoDto,
  CorpoDeAlteracaoDeAgendamento,
  CorpoDeNovoAgendamento,
} from '@bastion/contratos';
import { ErroDeDominio, gerarIdentificador } from '@bastion/dominio-compartilhado';
import { ATOR_SISTEMA, type ServicoDeAvaliacoes } from '../../avaliacoes/aplicacao/ServicoDeAvaliacoes';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { ErroDeAplicacao, naoEncontrado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { PoliticaDeLimitesDoPlano } from '../../contas/dominio/PoliticaDeLimitesDoPlano';
import type { Filas } from '../../integracoes/filas';
import type { ServicoDeSistemas } from '../../sistemas/aplicacao/ServicoDeSistemas';
import type { Sistema } from '../../sistemas/dominio/Sistema';
import { AgendamentoDeAvaliacao } from '../dominio/AgendamentoDeAvaliacao';
import { RepositorioDeAgendamentos } from '../infraestrutura/RepositorioDeAgendamentos';

export const MENSAGEM_DE_AGENDADOR_INDISPONIVEL =
  'Agendador indisponível; tente novamente.';

export type ResultadoDoDisparo = 'IGNORADO' | 'PULADO_POR_LIMITE' | 'AVALIACAO_CRIADA';

const paraRecorrencia = (agendamento: AgendamentoDeAvaliacao) => ({
  id: agendamento.id,
  organizacaoId: agendamento.organizacaoId,
  frequencia: agendamento.frequencia,
  horario: agendamento.horario,
  diaDaSemana: agendamento.diaDaSemana,
  diaDoMes: agendamento.diaDoMes,
});

export class ServicoDeAgendamentos {
  constructor(
    private readonly db: Banco,
    private readonly filas: Filas,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly sistemas: ServicoDeSistemas,
    private readonly avaliacoes: ServicoDeAvaliacoes,
    private readonly repositorio = new RepositorioDeAgendamentos(),
  ) {}

  async criar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeNovoAgendamento,
  ): Promise<AgendamentoDto> {
    const agora = this.relogio.agora();
    const { agendamento, sistemaNome } = await emContextoDaOrganizacao(
      this.db,
      contexto.organizacaoId,
      async (tx) => {
        const sistema = await this.sistemas.obterParaAvaliacao(tx, corpo.sistemaId);
        this.exigirSistemaAvaliavel(sistema, corpo.perfil, agora);
        const novo = AgendamentoDeAvaliacao.criar(
          {
            id: gerarIdentificador(),
            organizacaoId: contexto.organizacaoId,
            sistemaId: sistema.id,
            perfil: corpo.perfil,
            notaMinima: corpo.notaMinima,
            frequencia: corpo.frequencia,
            horario: corpo.horario,
            diaDaSemana: corpo.diaDaSemana ?? null,
            diaDoMes: corpo.diaDoMes ?? null,
            autorizacao: corpo.autorizacao ?? null,
            permitirCriacaoDeDados: corpo.perfil === 'COMPLETO' && corpo.permitirCriacaoDeDados,
          },
          agora,
        );
        await this.repositorio.inserir(tx, novo);
        await this.auditoria.registrar(tx, {
          organizacaoId: contexto.organizacaoId,
          ator: contexto.ator,
          acao: 'AGENDAMENTO_CRIADO',
          alvo: sistema.nome,
          detalhe: {
            agendamentoId: novo.id,
            sistemaId: sistema.id,
            perfil: novo.perfil,
            frequencia: novo.frequencia,
            horario: novo.horario,
            autorizadoPor: novo.autorizacao?.responsavel ?? null,
            referenciaDaAutorizacao: novo.autorizacao?.referencia ?? null,
          },
        });
        await registrarNoOutbox(tx, novo.puxarEventos());
        return { agendamento: novo, sistemaNome: sistema.nome };
      },
    );

    // Só depois do commit; se o agendador falhar, desfaz o cadastro para não deixar um agendamento "morto".
    try {
      await this.filas.registrarAgendamento(paraRecorrencia(agendamento));
    } catch (erro) {
      console.error('Falha ao registrar o agendador.', erro);
      await emContextoDaOrganizacao(this.db, contexto.organizacaoId, (tx) =>
        this.repositorio.remover(tx, contexto.organizacaoId, agendamento.id),
      );
      throw new ErroDeAplicacao(503, 'AGENDADOR_INDISPONIVEL', MENSAGEM_DE_AGENDADOR_INDISPONIVEL);
    }
    return this.paraDto(agendamento, sistemaNome);
  }

  async listar(contexto: ContextoDaRequisicao): Promise<AgendamentoDto[]> {
    const { agendamentos, nomes } = await emContextoDaOrganizacao(
      this.db,
      contexto.organizacaoId,
      async (tx) => {
        const lista = await this.repositorio.listar(tx, contexto.organizacaoId);
        const nomesDosSistemas = await this.avaliacoes.repositorio.nomesDosSistemas(
          tx,
          lista.map((agendamento) => agendamento.sistemaId),
        );
        return { agendamentos: lista, nomes: nomesDosSistemas };
      },
    );
    return Promise.all(
      agendamentos.map((agendamento) => this.paraDto(agendamento, nomes.get(agendamento.sistemaId) ?? '')),
    );
  }

  async alterar(
    contexto: ContextoDaRequisicao,
    id: string,
    corpo: CorpoDeAlteracaoDeAgendamento,
  ): Promise<AgendamentoDto> {
    const agora = this.relogio.agora();
    const { agendamento, sistemaNome } = await emContextoDaOrganizacao(
      this.db,
      contexto.organizacaoId,
      async (tx) => {
        const atual = await this.exigir(tx, contexto.organizacaoId, id);
        const sistema = await this.sistemas.obterParaAvaliacao(tx, atual.sistemaId);
        if (corpo.ativo) {
          if (sistema.estaArquivado) {
            throw new ErroDeDominio(
              'Este sistema está arquivado; o agendamento não pode ser retomado.',
              'SISTEMA_ARQUIVADO',
            );
          }
          atual.retomar(agora);
        } else {
          atual.pausar(agora);
        }
        await this.repositorio.salvar(tx, atual);
        await this.auditoria.registrar(tx, {
          organizacaoId: contexto.organizacaoId,
          ator: contexto.ator,
          acao: 'AGENDAMENTO_ALTERADO',
          alvo: sistema.nome,
          detalhe: { agendamentoId: atual.id, sistemaId: sistema.id, ativo: atual.ativo },
        });
        await registrarNoOutbox(tx, atual.puxarEventos());
        return { agendamento: atual, sistemaNome: sistema.nome };
      },
    );
    try {
      if (agendamento.ativo) await this.filas.registrarAgendamento(paraRecorrencia(agendamento));
      else await this.filas.removerAgendamento(agendamento.id);
    } catch (erro) {
      console.error('Falha ao atualizar o agendador.', erro);
      throw new ErroDeAplicacao(503, 'AGENDADOR_INDISPONIVEL', MENSAGEM_DE_AGENDADOR_INDISPONIVEL);
    }
    return this.paraDto(agendamento, sistemaNome);
  }

  async remover(contexto: ContextoDaRequisicao, id: string): Promise<void> {
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const agendamento = await this.exigir(tx, contexto.organizacaoId, id);
      const nomes = await this.avaliacoes.repositorio.nomesDosSistemas(tx, [agendamento.sistemaId]);
      await this.repositorio.remover(tx, contexto.organizacaoId, id);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'AGENDAMENTO_REMOVIDO',
        alvo: nomes.get(agendamento.sistemaId) ?? agendamento.sistemaId,
        detalhe: { agendamentoId: id, sistemaId: agendamento.sistemaId },
      });
    });
    try {
      await this.filas.removerAgendamento(id);
    } catch (erro) {
      // O agendamento já não existe: se o agendador disparar, o processador ignora.
      console.error('Falha ao remover o agendador.', erro);
    }
  }

  /**
   * Chamado pelo agendador a cada disparo. Agendamento ausente ou pausado é ignorado; se o limite
   * mensal do plano estourou, audita o salto; senão cria a avaliação (origem AGENDA) e a enfileira.
   */
  async disparar(organizacaoId: string, agendamentoId: string): Promise<ResultadoDoDisparo> {
    const decisao = await emContextoDaOrganizacao(this.db, organizacaoId, async (tx) => {
      const agendamento = await this.repositorio.buscarPorId(tx, organizacaoId, agendamentoId);
      if (!agendamento || !agendamento.ativo) return { resultado: 'IGNORADO' as const };
      const avaliacoesNoMes = await this.avaliacoes.contarDoMes(tx, organizacaoId);
      if (!PoliticaDeLimitesDoPlano.cabeAvaliacao(avaliacoesNoMes)) {
        const nomes = await this.avaliacoes.repositorio.nomesDosSistemas(tx, [agendamento.sistemaId]);
        await this.auditoria.registrar(tx, {
          organizacaoId,
          ator: ATOR_SISTEMA,
          acao: 'AGENDAMENTO_PULADO_POR_LIMITE',
          alvo: nomes.get(agendamento.sistemaId) ?? agendamento.sistemaId,
          detalhe: { agendamentoId, sistemaId: agendamento.sistemaId, avaliacoesNoMes },
        });
        return { resultado: 'PULADO_POR_LIMITE' as const };
      }
      return { resultado: 'AVALIACAO_CRIADA' as const, agendamento };
    });
    if (decisao.resultado !== 'AVALIACAO_CRIADA') return decisao.resultado;

    const agendamento = decisao.agendamento;
    await this.avaliacoes.solicitarPorAgenda(organizacaoId, {
      sistemaId: agendamento.sistemaId,
      perfil: agendamento.perfil,
      notaMinima: agendamento.notaMinima,
      autorizacao: agendamento.autorizacao,
      permitirCriacaoDeDados: agendamento.permitirCriacaoDeDados,
    });
    return 'AVALIACAO_CRIADA';
  }

  private exigirSistemaAvaliavel(sistema: Sistema, perfil: AgendamentoDeAvaliacao['perfil'], agora: Date): void {
    if (sistema.estaArquivado) {
      throw new ErroDeDominio('Este sistema está arquivado e não pode ser agendado.', 'SISTEMA_ARQUIVADO');
    }
    if (!sistema.estaVerificado(agora)) {
      throw new ErroDeDominio(
        'A propriedade do sistema precisa estar verificada para criar um agendamento.',
        'SISTEMA_NAO_VERIFICADO',
      );
    }
    const aptidao = sistema.podeAvaliarComPerfil(perfil, agora);
    if (!aptidao.ok) {
      throw new ErroDeDominio(aptidao.motivo ?? 'Perfil indisponível.', 'PERFIL_INDISPONIVEL');
    }
  }

  private async exigir(
    tx: Transacao,
    organizacaoId: string,
    id: string,
  ): Promise<AgendamentoDeAvaliacao> {
    const agendamento = await this.repositorio.buscarPorId(tx, organizacaoId, id);
    if (!agendamento) throw naoEncontrado('Agendamento');
    return agendamento;
  }

  private async paraDto(agendamento: AgendamentoDeAvaliacao, sistemaNome: string): Promise<AgendamentoDto> {
    let proximaExecucaoEm: string | null = null;
    if (agendamento.ativo) {
      try {
        proximaExecucaoEm = await this.filas.proximaExecucaoDoAgendamento(agendamento.id);
      } catch {
        proximaExecucaoEm = null;
      }
    }
    return {
      id: agendamento.id,
      sistemaId: agendamento.sistemaId,
      sistemaNome,
      perfil: agendamento.perfil,
      notaMinima: agendamento.notaMinima,
      frequencia: agendamento.frequencia,
      horario: agendamento.horario,
      diaDaSemana: agendamento.diaDaSemana,
      diaDoMes: agendamento.diaDoMes,
      ativo: agendamento.ativo,
      autorizacao: agendamento.autorizacao
        ? {
            responsavel: agendamento.autorizacao.responsavel,
            referencia: agendamento.autorizacao.referencia,
          }
        : null,
      proximaExecucaoEm,
      criadoEm: agendamento.criadoEm.toISOString(),
    };
  }
}
