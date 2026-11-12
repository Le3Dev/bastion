import type {
  CorpoDeCadastroDeSistema,
  CorpoDeVerificacao,
  InstrucoesDeVerificacaoDto,
  RespostaDeCadastroDeSistema,
  RespostaDeVerificacao,
  ResultadoDaVerificacao,
  SistemaDto,
  TarefaVerificarPropriedade,
} from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { naoEncontrado, tempoEsgotado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { gerarTokenDeVerificacao } from '../../contas/infraestrutura/tokens';
import { ErroDeTempoEsgotadoDaFila, type Filas } from '../../integracoes/filas';
import { Sistema } from '../dominio/Sistema';
import { RepositorioDeSistemas } from '../infraestrutura/RepositorioDeSistemas';

export const MENSAGEM_DE_VERIFICACAO_DEMOROU =
  'A verificação demorou demais; confira se o worker está rodando e tente novamente.';

export const paraInstrucoesDto = (sistema: Sistema): InstrucoesDeVerificacaoDto => {
  const verificacao = sistema.verificacao;
  return {
    metodo: verificacao.metodo,
    token: verificacao.token,
    ...verificacao.instrucoes(sistema.hostDeHomologacao),
  };
};

export const paraSistemaDto = (sistema: Sistema, agora: Date): SistemaDto => {
  const verificacao = sistema.verificacao;
  return {
    id: sistema.id,
    nome: sistema.nome,
    tipo: sistema.tipo,
    urlDeHomologacao: sistema.urlDeHomologacao,
    dominioDeProducao: sistema.dominioDeProducao,
    verificacao: {
      metodo: verificacao.metodo,
      estado: verificacao.estadoEm(agora),
      verificadoEm: verificacao.verificadoEm?.toISOString() ?? null,
      expiraEm: verificacao.expiraEm?.toISOString() ?? null,
      mensagem: verificacao.mensagem,
    },
    ultimaNota: sistema.ultimaNota,
    criadoEm: sistema.criadoEm.toISOString(),
  };
};

export class ServicoDeSistemas {
  constructor(
    private readonly db: Banco,
    private readonly filas: Filas,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly repositorio = new RepositorioDeSistemas(),
  ) {}

  async cadastrar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeCadastroDeSistema,
  ): Promise<RespostaDeCadastroDeSistema> {
    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistema = Sistema.cadastrar(
        {
          id: gerarIdentificador(),
          organizacaoId: contexto.organizacaoId,
          nome: corpo.nome,
          tipo: corpo.tipo,
          urlDeHomologacao: corpo.urlDeHomologacao,
          dominioDeProducao: corpo.dominioDeProducao,
          metodoDeVerificacao: corpo.metodoDeVerificacao,
          token: gerarTokenDeVerificacao(),
        },
        agora,
      );
      await this.repositorio.inserir(tx, sistema);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'SISTEMA_CADASTRADO',
        alvo: sistema.nome,
        detalhe: { sistemaId: sistema.id, hostDeHomologacao: sistema.hostDeHomologacao },
      });
      await registrarNoOutbox(tx, sistema.puxarEventos());
      return {
        id: sistema.id,
        estadoVerificacao: sistema.verificacao.estadoEm(agora),
        verificacao: paraInstrucoesDto(sistema),
      };
    });
  }

  async listar(contexto: ContextoDaRequisicao): Promise<SistemaDto[]> {
    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistemas = await this.repositorio.listar(tx, contexto.organizacaoId);
      return sistemas.map((sistema) => paraSistemaDto(sistema, agora));
    });
  }

  async obter(contexto: ContextoDaRequisicao, sistemaId: string): Promise<SistemaDto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistema = await this.exigir(tx, contexto.organizacaoId, sistemaId);
      return paraSistemaDto(sistema, this.relogio.agora());
    });
  }

  async instrucoes(
    contexto: ContextoDaRequisicao,
    sistemaId: string,
  ): Promise<InstrucoesDeVerificacaoDto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) =>
      paraInstrucoesDto(await this.exigir(tx, contexto.organizacaoId, sistemaId)),
    );
  }

  /**
   * Pede ao worker que confira a prova de propriedade e registra o resultado no agregado.
   * A espera pela fila acontece FORA de qualquer transação.
   */
  async verificar(
    contexto: ContextoDaRequisicao,
    sistemaId: string,
    corpo: CorpoDeVerificacao,
  ): Promise<RespostaDeVerificacao> {
    const tarefa = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistema = await this.exigir(tx, contexto.organizacaoId, sistemaId);
      if (corpo.metodo && corpo.metodo !== sistema.verificacao.metodo) {
        sistema.trocarMetodoDeVerificacao(corpo.metodo, sistema.verificacao.token);
        await this.repositorio.salvar(tx, sistema);
      }
      const tarefaMontada: TarefaVerificarPropriedade = {
        sistemaId: sistema.id,
        organizacaoId: contexto.organizacaoId,
        metodo: sistema.verificacao.metodo,
        token: sistema.verificacao.token,
        urlDeHomologacao: sistema.urlDeHomologacao,
      };
      return tarefaMontada;
    });

    let resultado: ResultadoDaVerificacao;
    try {
      resultado = await this.filas.enfileirarVerificacao(tarefa);
    } catch (erro) {
      if (erro instanceof ErroDeTempoEsgotadoDaFila) {
        throw tempoEsgotado(MENSAGEM_DE_VERIFICACAO_DEMOROU, 'VERIFICACAO_DEMOROU');
      }
      throw erro;
    }

    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistema = await this.exigir(tx, contexto.organizacaoId, sistemaId);
      sistema.registrarResultadoDaVerificacao(resultado.verificado, resultado.mensagem, agora);
      await this.repositorio.salvar(tx, sistema);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: resultado.verificado ? 'PROPRIEDADE_VERIFICADA' : 'VERIFICACAO_FALHOU',
        alvo: sistema.nome,
        detalhe: {
          sistemaId: sistema.id,
          metodo: sistema.verificacao.metodo,
          mensagem: resultado.mensagem,
        },
      });
      await registrarNoOutbox(tx, sistema.puxarEventos());
      return {
        verificado: resultado.verificado,
        expiraEm: sistema.verificacao.expiraEm?.toISOString() ?? null,
        mensagem: resultado.verificado ? null : resultado.mensagem,
      };
    });
  }

  /** Usado pelas avaliações (leva 3): carrega o sistema no contexto (RLS) da transação recebida. */
  async obterParaAvaliacao(tx: Transacao, sistemaId: string): Promise<Sistema> {
    const sistema = await this.repositorio.buscarPorIdNoContexto(tx, sistemaId);
    if (!sistema) throw naoEncontrado('Sistema');
    return sistema;
  }

  async salvar(tx: Transacao, sistema: Sistema): Promise<void> {
    await this.repositorio.salvar(tx, sistema);
  }

  private async exigir(tx: Transacao, organizacaoId: string, sistemaId: string): Promise<Sistema> {
    const sistema = await this.repositorio.buscarPorId(tx, organizacaoId, sistemaId);
    if (!sistema) throw naoEncontrado('Sistema');
    return sistema;
  }
}
