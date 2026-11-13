import type {
  CorpoDeCadastroDeSistema,
  CorpoDeConectorDeIa,
  CorpoDeCredencialDeTeste,
  CorpoDeVerificacao,
  InstrucoesDeVerificacaoDto,
  RespostaDeCadastroDeSistema,
  RespostaDeVerificacao,
  ResultadoDaVerificacao,
  SistemaDto,
  TarefaVerificarPropriedade,
} from '@bastion/contratos';
import { ErroDeDominio, gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { Cifragem } from '../../compartilhado/cifragem';
import { ConectorDeIa } from '../dominio/ConectorDeIa';
import { CredencialDeTeste } from '../dominio/CredencialDeTeste';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { naoEncontrado, tempoEsgotado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { gerarTokenDeVerificacao } from '../../contas/infraestrutura/tokens';
import { ErroDeTempoEsgotadoDaFila, type Filas } from '../../integracoes/filas';
import { RepositorioDeAgendamentos } from '../../agendamentos/infraestrutura/RepositorioDeAgendamentos';
import { PoliticaDeLimitesDoPlano } from '../../contas/dominio/PoliticaDeLimitesDoPlano';
import type { MetodoDeVerificacao } from '../dominio/MetodoDeVerificacao';
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
    // Nunca expõe usuário, senha nem cabeçalhos: só o que o operador precisa ver.
    credencialDeTeste: sistema.credencialDeTeste
      ? {
          configurada: true,
          modo: sistema.credencialDeTeste.modo,
          urlDeLogin: sistema.credencialDeTeste.urlDeLogin,
          indicadorDeSucesso: sistema.credencialDeTeste.indicadorDeSucesso,
        }
      : { configurada: false, modo: null, urlDeLogin: null, indicadorDeSucesso: null },
    conectorDeIa: sistema.conectorDeIa
      ? {
          configurado: true,
          url: sistema.conectorDeIa.url,
          caminhoDaResposta: sistema.conectorDeIa.caminhoDaResposta,
        }
      : { configurado: false, url: null, caminhoDaResposta: null },
    arquivado: sistema.estaArquivado,
    criadoEm: sistema.criadoEm.toISOString(),
  };
};

export class ServicoDeSistemas {
  constructor(
    private readonly db: Banco,
    private readonly filas: Filas,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly cifragem: Cifragem,
    private readonly repositorio = new RepositorioDeSistemas(),
    private readonly agendamentos = new RepositorioDeAgendamentos(),
  ) {}

  async cadastrar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeCadastroDeSistema,
  ): Promise<RespostaDeCadastroDeSistema> {
    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      PoliticaDeLimitesDoPlano.exigirPodeCadastrarSistema(
        await this.repositorio.contarAtivos(tx, contexto.organizacaoId),
      );
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

  /** Por padrão esconde os arquivados; `incluirArquivados` os mostra. */
  async listar(contexto: ContextoDaRequisicao, incluirArquivados = false): Promise<SistemaDto[]> {
    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistemas = await this.repositorio.listar(tx, contexto.organizacaoId, incluirArquivados);
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

  async definirCredencialDeTeste(
    contexto: ContextoDaRequisicao,
    sistemaId: string,
    corpo: CorpoDeCredencialDeTeste,
  ): Promise<SistemaDto> {
    return this.alterar(contexto, sistemaId, 'CREDENCIAL_DE_TESTE_ALTERADA', (sistema) => {
      sistema.definirCredencialDeTeste(
        CredencialDeTeste.criar({
          modo: corpo.modo,
          urlDeLogin: corpo.urlDeLogin,
          campoUsuario: corpo.campoUsuario,
          campoSenha: corpo.campoSenha,
          indicadorDeSucesso: corpo.indicadorDeSucesso,
          segredoUsuarioCifrado: this.cifragem.cifrar(corpo.usuario),
          segredoSenhaCifrado: this.cifragem.cifrar(corpo.senha),
        }),
      );
      return { acao: 'configurada', modo: corpo.modo };
    });
  }

  async removerCredencialDeTeste(contexto: ContextoDaRequisicao, sistemaId: string): Promise<SistemaDto> {
    return this.alterar(contexto, sistemaId, 'CREDENCIAL_DE_TESTE_ALTERADA', (sistema) => {
      sistema.removerCredencialDeTeste();
      return { acao: 'removida' };
    });
  }

  async definirConectorDeIa(
    contexto: ContextoDaRequisicao,
    sistemaId: string,
    corpo: CorpoDeConectorDeIa,
  ): Promise<SistemaDto> {
    return this.alterar(contexto, sistemaId, 'CONECTOR_DE_IA_ALTERADO', (sistema) => {
      if (sistema.tipo !== 'APP_COM_IA') {
        throw new ErroDeDominio(
          'O conector de IA só se aplica a sistemas do tipo app com IA.',
          'CONECTOR_INDISPONIVEL',
        );
      }
      const cabecalhos = corpo.cabecalhos;
      sistema.definirConectorDeIa(
        ConectorDeIa.criar({
          url: corpo.url,
          modeloDoCorpo: corpo.modeloDoCorpo,
          caminhoDaResposta: corpo.caminhoDaResposta,
          frasesSigilosas: corpo.frasesSigilosas,
          cabecalhosCifrados:
            cabecalhos && Object.keys(cabecalhos).length > 0
              ? this.cifragem.cifrar(JSON.stringify(cabecalhos))
              : null,
        }),
      );
      return { acao: 'configurado', url: corpo.url };
    });
  }

  async removerConectorDeIa(contexto: ContextoDaRequisicao, sistemaId: string): Promise<SistemaDto> {
    return this.alterar(contexto, sistemaId, 'CONECTOR_DE_IA_ALTERADO', (sistema) => {
      sistema.removerConectorDeIa();
      return { acao: 'removido' };
    });
  }

  /**
   * Arquiva o sistema (não é mais avaliável nem conta no limite do plano) e pausa os
   * agendamentos dele, na mesma transação. Os agendadores da fila são removidos depois do commit.
   */
  async arquivar(contexto: ContextoDaRequisicao, sistemaId: string): Promise<SistemaDto> {
    const agora = this.relogio.agora();
    const { dto, agendamentosPausados } = await emContextoDaOrganizacao(
      this.db,
      contexto.organizacaoId,
      async (tx) => {
        const sistema = await this.exigir(tx, contexto.organizacaoId, sistemaId);
        sistema.arquivar(agora);
        await this.repositorio.salvar(tx, sistema);
        const ativos = await this.agendamentos.listarAtivosPorSistema(
          tx,
          contexto.organizacaoId,
          sistema.id,
        );
        for (const agendamento of ativos) {
          agendamento.pausar(agora);
          await this.agendamentos.salvar(tx, agendamento);
          await registrarNoOutbox(tx, agendamento.puxarEventos());
        }
        await this.auditoria.registrar(tx, {
          organizacaoId: contexto.organizacaoId,
          ator: contexto.ator,
          acao: 'SISTEMA_ARQUIVADO',
          alvo: sistema.nome,
          detalhe: { sistemaId: sistema.id, agendamentosPausados: ativos.length },
        });
        await registrarNoOutbox(tx, sistema.puxarEventos());
        return {
          dto: paraSistemaDto(sistema, agora),
          agendamentosPausados: ativos.map((agendamento) => agendamento.id),
        };
      },
    );
    for (const id of agendamentosPausados) {
      try {
        await this.filas.removerAgendamento(id);
      } catch (erro) {
        console.error('Falha ao remover o agendador de um sistema arquivado.', erro);
      }
    }
    return dto;
  }

  /** Troca o método de prova de propriedade: novo token e a verificação volta a PENDENTE. */
  async trocarMetodo(
    contexto: ContextoDaRequisicao,
    sistemaId: string,
    metodo: MetodoDeVerificacao,
  ): Promise<InstrucoesDeVerificacaoDto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistema = await this.exigir(tx, contexto.organizacaoId, sistemaId);
      const anterior = sistema.verificacao.metodo;
      sistema.trocarMetodoDeVerificacao(metodo, gerarTokenDeVerificacao());
      await this.repositorio.salvar(tx, sistema);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'METODO_DE_VERIFICACAO_ALTERADO',
        alvo: sistema.nome,
        detalhe: { sistemaId: sistema.id, metodoAnterior: anterior, metodoNovo: metodo },
      });
      return paraInstrucoesDto(sistema);
    });
  }

  /** Aplica a mudança no agregado, salva e audita (sem segredos no detalhe) na mesma transação. */
  private async alterar(
    contexto: ContextoDaRequisicao,
    sistemaId: string,
    acao: 'CREDENCIAL_DE_TESTE_ALTERADA' | 'CONECTOR_DE_IA_ALTERADO',
    mudar: (sistema: Sistema) => Record<string, unknown>,
  ): Promise<SistemaDto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const sistema = await this.exigir(tx, contexto.organizacaoId, sistemaId);
      const detalhe = mudar(sistema);
      await this.repositorio.salvar(tx, sistema);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao,
        alvo: sistema.nome,
        detalhe: { sistemaId: sistema.id, ...detalhe },
      });
      return paraSistemaDto(sistema, this.relogio.agora());
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
