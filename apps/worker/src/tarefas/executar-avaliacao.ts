import {
  TarefaExecutarAvaliacao,
  type Constatacao,
  type EstadoDaEtapa,
  type PerfilDeAvaliacao,
} from '@bastion/contratos';
import type { Cancelamento } from '../cancelamento';
import {
  RequisicaoBloqueada,
  type ClienteHttp,
  type DecisaoRegistrada,
} from '../guardiao-de-escopo/cliente-http';
import { aplicarFreios, CircuitoDeFalhas, ErroDeFreio } from '../guardiao-de-escopo/freios';
import { LimitadorDeTaxa } from '../guardiao-de-escopo/limitador-de-taxa';
import { avaliarRequisicao } from '../guardiao-de-escopo/regras';
import { criarContexto } from '../modulos/ativo/comum';
import {
  autenticar,
  protegerConstatacoes,
  repetirChecagensWeb,
  sondarControleDeAcesso,
  sondarInjecao,
  sondarPaginasSemSessao,
  type SessaoDeTeste,
} from '../modulos/ativo/autenticado';
import { descobrirPaginas, type PaginaDescoberta } from '../modulos/ativo/descoberta';
import {
  avaliarIntegridadeDoPrompt,
  avaliarSaida,
  avaliarVazamento,
  conectarIa,
  type ConversaDeIa,
} from '../modulos/ativo/ia';
import {
  analisarCsrf,
  sondarArquivosExpostos,
  sondarCorsEMetodos,
  sondarEntradaRefletida,
  sondarErrosDetalhados,
  sondarRedirecionamentos,
  sondarSsrf,
} from '../modulos/ativo/web';
import {
  analisarCabecalhos,
  analisarCookies,
  analisarExposicaoDeVersao,
  analisarTls,
  type DadosDoTls,
  type RespostaColetada,
} from '../modulos/passivo';
import type { DadosDoEvento, PublicadorDeResultados } from '../resultados';

export const ETAPAS = [
  'Conferir propriedade e escopo',
  'Cabeçalhos de segurança',
  'TLS e certificado',
  'Flags de cookies',
  'Exposição de versão',
  'Análise e deduplicação',
] as const;

const ETAPAS_PADRAO = [
  ...ETAPAS.slice(0, 5),
  'Mapeamento de páginas',
  'Arquivos e configurações expostos',
  'CORS e métodos HTTP',
  'Entrada refletida, redirecionamentos, CSRF e SSRF',
  'Análise e deduplicação',
] as const;

const ETAPAS_COMPLETO = [
  ...ETAPAS_PADRAO.slice(0, 9),
  'Autenticação de teste',
  'Controle de acesso',
  'Injeção (SQL, template, caminho)',
  'Análise e deduplicação',
] as const;

const ETAPAS_IA = [
  'Conferir propriedade e escopo',
  'Conector de IA',
  'Integridade do prompt',
  'Vazamento de informação',
  'Segurança da saída',
  'Análise e deduplicação',
] as const;

export const ETAPAS_POR_PERFIL: Record<PerfilDeAvaliacao, readonly string[]> = {
  PASSIVO: ETAPAS,
  PADRAO: ETAPAS_PADRAO,
  COMPLETO: ETAPAS_COMPLETO,
  IA: ETAPAS_IA,
};

export type SondaTls = (alvo: { host: string; porta: number }) => Promise<DadosDoTls>;

export interface DependenciasDoExecutor {
  clienteHttp: Pick<ClienteHttp, 'requisitar'>;
  sondaTls: SondaTls;
  publicador: Pick<PublicadorDeResultados, 'publicar'>;
  cancelamento: Cancelamento;
  /** Milissegundos desde uma origem qualquer (injetável nos testes). */
  relogio: () => number;
  /** Teto de requisições por segundo (config do worker); vale o menor entre ele e o do escopo. */
  requisicoesPorSegundoMaximo?: number;
  /** Mensagens de teste por segundo ao conector de IA (padrão 1; só os testes alteram). */
  mensagensDeIaPorSegundo?: number;
}

export interface ExecutorDeAvaliacao {
  executar(tarefa: unknown): Promise<void>;
}

type EventoDaAvaliacao = Exclude<DadosDoEvento, { tipo: 'entrega-concluida' }>;
type OmitirDeUniao<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type DadosDoEventoDaAvaliacao = OmitirDeUniao<EventoDaAvaliacao, 'organizacaoId' | 'avaliacaoId'>;

/** A avaliação foi cancelada: a API já marcou CANCELADA, então o worker encerra em silêncio. */
class AvaliacaoCancelada extends Error {}
class TempoMaximoExcedido extends Error {}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof RequisicaoBloqueada) return erro.message;
  if (erro instanceof Error && erro.message !== '') return erro.message;
  return 'Erro inesperado durante a avaliação.';
}

export function criarExecutorDeAvaliacao(deps: DependenciasDoExecutor): ExecutorDeAvaliacao {
  async function executar(tarefaBruta: unknown): Promise<void> {
    const analise = TarefaExecutarAvaliacao.safeParse(tarefaBruta);
    if (!analise.success) {
      const detalhe = analise.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.message}`).join('; ');
      throw new Error(`Tarefa de avaliação inválida: ${detalhe}.`);
    }
    const tarefa = analise.data;
    const { avaliacaoId, organizacaoId, escopo } = tarefa;
    const inicio = deps.relogio();

    const emitir = (dados: DadosDoEventoDaAvaliacao): Promise<unknown> =>
      deps.publicador.publicar({ ...dados, organizacaoId, avaliacaoId });

    // Decisões do Guardião chegam de forma síncrona; a fila preserva a ordem de publicação.
    let pendentes: Promise<unknown> = Promise.resolve();
    const aoDecidir = (decisao: DecisaoRegistrada): void => {
      pendentes = pendentes.then(() => emitir({ tipo: 'requisicao-do-guardiao', ...decisao }));
      pendentes.catch(() => undefined);
    };
    const drenar = async (): Promise<void> => {
      await pendentes;
    };

    const conferirContinuidade = async (): Promise<void> => {
      if (await deps.cancelamento.foiCancelada(avaliacaoId)) throw new AvaliacaoCancelada();
      if (deps.relogio() - inicio > escopo.tempoMaximoMs) throw new TempoMaximoExcedido();
    };

    const nomesDasEtapas = ETAPAS_POR_PERFIL[tarefa.perfil];

    const atualizarEtapa = (nome: string, estado: EstadoDaEtapa): Promise<unknown> => {
      const concluida = estado === 'CONCLUIDA' || estado === 'FALHOU' || estado === 'IGNORADA';
      const indice = Math.max(0, nomesDasEtapas.indexOf(nome));
      return emitir({
        tipo: 'etapa-atualizada',
        nome,
        estado,
        progresso: Math.round(((indice + (concluida ? 1 : 0)) / nomesDasEtapas.length) * 100),
      });
    };

    /** Executa uma etapa: confere cancelamento/tempo, emite os estados e trata a falha. */
    const etapa = async (
      nome: string,
      critica: boolean,
      corpo: () => Promise<'ignorada' | void>,
    ): Promise<void> => {
      await conferirContinuidade();
      await atualizarEtapa(nome, 'EM_EXECUCAO');
      let resultado: 'ignorada' | void;
      try {
        resultado = await corpo();
        await drenar();
      } catch (erro) {
        await drenar().catch(() => undefined);
        // Cancelamento, tempo e freios (teto/disjuntor) encerram a avaliação inteira.
        if (
          erro instanceof AvaliacaoCancelada ||
          erro instanceof TempoMaximoExcedido ||
          erro instanceof ErroDeFreio
        ) {
          throw erro;
        }
        await atualizarEtapa(nome, 'FALHOU');
        if (critica) throw erro;
        return;
      }
      await atualizarEtapa(nome, resultado === 'ignorada' ? 'IGNORADA' : 'CONCLUIDA');
    };

    const emitirConstatacoes = async (constatacoes: Constatacao[]): Promise<void> => {
      for (const constatacao of constatacoes) {
        await emitir({ tipo: 'constatacao', constatacao });
      }
    };

    try {
      await conferirContinuidade();
      await emitir({ tipo: 'preparacao-iniciada' });

      let urlInicial: URL;
      try {
        urlInicial = new URL(tarefa.urlDeHomologacao);
      } catch {
        throw new Error('A URL de homologação é inválida.');
      }
      const ehIa = tarefa.perfil === 'IA';
      const conectorDeIa = tarefa.conectorDeIa;
      const decisaoDeEscopo = avaliarRequisicao({
        url: ehIa && conectorDeIa ? conectorDeIa.url : urlInicial.toString(),
        metodo: ehIa ? 'POST' : 'GET',
        perfil: tarefa.perfil,
        escopo,
      });
      if (!decisaoDeEscopo.permitida) {
        throw new Error(
          `${ehIa ? 'O conector de IA' : 'A URL de homologação'} está fora do escopo: ${decisaoDeEscopo.motivo}.`,
        );
      }
      await emitir({ tipo: 'execucao-iniciada' });

      const limitador = new LimitadorDeTaxa(
        Math.min(escopo.requisicoesPorSegundo, deps.requisicoesPorSegundoMaximo ?? escopo.requisicoesPorSegundo),
      );
      // Freios: teto de requisições e disjuntor de falhas valem para toda a avaliação.
      const freios = aplicarFreios(deps.clienteHttp, {
        tetoDeRequisicoes: escopo.tetoDeRequisicoes,
        circuito: new CircuitoDeFalhas(10),
        ...(tarefa.perfil === 'PASSIVO' ? {} : { antes: conferirContinuidade }),
      });
      const contexto = criarContexto({
        clienteHttp: freios,
        perfil: tarefa.perfil,
        escopo,
        limitador,
        aoDecidir,
      });
      const encerrar = async (): Promise<void> => {
        // 6. Análise e deduplicação (a deduplicação em si acontece na API)
        const analise = 'Análise e deduplicação';
        await conferirContinuidade();
        await atualizarEtapa(analise, 'EM_EXECUCAO');
        await emitir({ tipo: 'analise-iniciada' });
        await atualizarEtapa(analise, 'CONCLUIDA');
        await emitir({ tipo: 'avaliacao-finalizada' });
      };

      if (ehIa) {
        // Perfil IA: conversa com o chatbot/agente pelo conector declarado.
        let conversa: ConversaDeIa | null = null;
        await etapa('Conferir propriedade e escopo', true, async () => {
          if (!conectorDeIa) throw new Error('O perfil de IA exige um conector de IA configurado no sistema.');
        });
        const conector = conectorDeIa;
        if (!conector) throw new Error('O perfil de IA exige um conector de IA configurado no sistema.');
        const limitadorDeIa = new LimitadorDeTaxa(deps.mensagensDeIaPorSegundo ?? 1);
        await etapa('Conector de IA', true, async () => {
          conversa = await conectarIa({ contexto, conector, limitador: limitadorDeIa });
        });
        const dialogo = conversa as ConversaDeIa | null;
        if (dialogo === null) throw new Error('O conector de IA não respondeu.');
        await etapa('Integridade do prompt', false, async () =>
          emitirConstatacoes(await avaliarIntegridadeDoPrompt(dialogo, conector)),
        );
        await etapa('Vazamento de informação', false, async () =>
          emitirConstatacoes(await avaliarVazamento(dialogo, conector)),
        );
        await etapa('Segurança da saída', false, async () =>
          emitirConstatacoes(await avaliarSaida(dialogo, conector)),
        );
        await encerrar();
        return;
      }

      let resposta: RespostaColetada | null = null;

      // 1. Conferir propriedade e escopo
      await etapa('Conferir propriedade e escopo', true, async () => {
        const recebida = await freios.requisitar({
          url: urlInicial.toString(),
          metodo: 'GET',
          perfil: tarefa.perfil,
          escopo,
          limitador,
          aoDecidir,
        });
        resposta = {
          url: recebida.url,
          metodo: 'GET',
          status: recebida.status,
          cabecalhos: recebida.cabecalhos,
        };
      });
      const coletada = resposta as RespostaColetada | null;
      if (coletada === null) throw new Error('Nenhuma resposta foi coletada da URL de homologação.');

      // 2. Cabeçalhos de segurança
      await etapa('Cabeçalhos de segurança', false, async () => emitirConstatacoes(analisarCabecalhos(coletada)));

      // 3. TLS e certificado (a falha desta sonda não derruba a avaliação)
      await etapa('TLS e certificado', false, async () => {
        const final = new URL(coletada.url);
        if (final.protocol !== 'https:') return 'ignorada';
        const porta = final.port === '' ? 443 : Number(final.port);
        const dados = await deps.sondaTls({ host: final.hostname, porta });
        await emitirConstatacoes(analisarTls(dados, new Date()));
        return undefined;
      });

      // 4. Flags de cookies
      await etapa('Flags de cookies', false, async () => emitirConstatacoes(analisarCookies(coletada)));

      // 5. Exposição de versão
      await etapa('Exposição de versão', false, async () => emitirConstatacoes(analisarExposicaoDeVersao(coletada)));

      if (tarefa.perfil === 'PADRAO' || tarefa.perfil === 'COMPLETO') {
        const inicio0 = urlInicial.toString();
        let paginas: PaginaDescoberta[] = [];

        await etapa('Mapeamento de páginas', false, async () => {
          paginas = await descobrirPaginas({ contexto, urlInicial: inicio0 });
        });
        await etapa('Arquivos e configurações expostos', false, async () =>
          emitirConstatacoes(await sondarArquivosExpostos(contexto, inicio0, paginas)),
        );
        await etapa('CORS e métodos HTTP', false, async () =>
          emitirConstatacoes(await sondarCorsEMetodos(contexto, inicio0)),
        );
        await etapa('Entrada refletida, redirecionamentos, CSRF e SSRF', false, async () => {
          await emitirConstatacoes(await sondarRedirecionamentos(contexto, inicio0, paginas));
          await emitirConstatacoes(await sondarEntradaRefletida(contexto, inicio0, paginas));
          await emitirConstatacoes(await sondarErrosDetalhados(contexto, inicio0, paginas));
          await emitirConstatacoes(analisarCsrf(paginas));
          await emitirConstatacoes(await sondarSsrf(contexto, paginas));
        });

        if (tarefa.perfil === 'COMPLETO') {
          const credencial = tarefa.credencialDeTeste;
          let sessao: SessaoDeTeste | null = null;
          let paginasAutenticadas: PaginaDescoberta[] = [];

          await etapa('Autenticação de teste', false, async () => {
            if (!credencial) return 'ignorada';
            sessao = await autenticar({ contexto, credencial });
            paginasAutenticadas = await descobrirPaginas({ contexto: sessao.contexto, urlInicial: inicio0 });
            return undefined;
          });
          const ativa = sessao as SessaoDeTeste | null;

          await etapa('Controle de acesso', false, async () => {
            if (!ativa || !credencial) return 'ignorada';
            const achados = [
              ...(await sondarPaginasSemSessao(ativa, paginasAutenticadas, paginas)),
              ...(await sondarControleDeAcesso(ativa, paginasAutenticadas)),
              ...(await repetirChecagensWeb(ativa, inicio0, paginasAutenticadas)),
            ];
            await emitirConstatacoes(protegerConstatacoes(achados, credencial));
            return undefined;
          });

          await etapa('Injeção (SQL, template, caminho)', false, async () => {
            const alvo: SessaoDeTeste = ativa ?? { contexto, semSessao: contexto, relogins: () => 0 };
            const achados = await sondarInjecao(alvo, [...paginasAutenticadas, ...paginas]);
            await emitirConstatacoes(credencial ? protegerConstatacoes(achados, credencial) : achados);
          });
        }
      }

      await encerrar();
    } catch (erro) {
      await drenar().catch(() => undefined);
      if (erro instanceof AvaliacaoCancelada) return;
      const motivo = erro instanceof TempoMaximoExcedido ? 'Tempo máximo do perfil excedido.' : mensagemDoErro(erro);
      await emitir({ tipo: 'avaliacao-falhou', motivo });
    }
  }

  return { executar };
}
