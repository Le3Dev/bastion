import { TarefaExecutarAvaliacao, type Constatacao, type EstadoDaEtapa } from '@bastion/contratos';
import type { Cancelamento } from '../cancelamento';
import {
  RequisicaoBloqueada,
  type ClienteHttp,
  type DecisaoRegistrada,
} from '../guardiao-de-escopo/cliente-http';
import { LimitadorDeTaxa } from '../guardiao-de-escopo/limitador-de-taxa';
import { avaliarRequisicao } from '../guardiao-de-escopo/regras';
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

    const atualizarEtapa = (indice: number, estado: EstadoDaEtapa): Promise<unknown> => {
      const concluida = estado === 'CONCLUIDA' || estado === 'FALHOU' || estado === 'IGNORADA';
      const nome = ETAPAS[indice] ?? 'Etapa';
      return emitir({
        tipo: 'etapa-atualizada',
        nome,
        estado,
        progresso: Math.round(((indice + (concluida ? 1 : 0)) / ETAPAS.length) * 100),
      });
    };

    /** Executa uma etapa: confere cancelamento/tempo, emite os estados e trata a falha. */
    const etapa = async (
      indice: number,
      critica: boolean,
      corpo: () => Promise<'ignorada' | void>,
    ): Promise<void> => {
      await conferirContinuidade();
      await atualizarEtapa(indice, 'EM_EXECUCAO');
      let resultado: 'ignorada' | void;
      try {
        resultado = await corpo();
        await drenar();
      } catch (erro) {
        await drenar().catch(() => undefined);
        if (erro instanceof AvaliacaoCancelada || erro instanceof TempoMaximoExcedido) throw erro;
        await atualizarEtapa(indice, 'FALHOU');
        if (critica) throw erro;
        return;
      }
      await atualizarEtapa(indice, resultado === 'ignorada' ? 'IGNORADA' : 'CONCLUIDA');
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
      const decisaoDeEscopo = avaliarRequisicao({
        url: urlInicial.toString(),
        metodo: 'GET',
        perfil: 'PASSIVO',
        escopo,
      });
      if (!decisaoDeEscopo.permitida) {
        throw new Error(`A URL de homologação está fora do escopo: ${decisaoDeEscopo.motivo}.`);
      }
      await emitir({ tipo: 'execucao-iniciada' });

      const limitador = new LimitadorDeTaxa(
        Math.min(escopo.requisicoesPorSegundo, deps.requisicoesPorSegundoMaximo ?? escopo.requisicoesPorSegundo),
      );
      let resposta: RespostaColetada | null = null;

      // 1. Conferir propriedade e escopo
      await etapa(0, true, async () => {
        const recebida = await deps.clienteHttp.requisitar({
          url: urlInicial.toString(),
          metodo: 'GET',
          perfil: 'PASSIVO',
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
      await etapa(1, false, async () => emitirConstatacoes(analisarCabecalhos(coletada)));

      // 3. TLS e certificado (a falha desta sonda não derruba a avaliação)
      await etapa(2, false, async () => {
        const final = new URL(coletada.url);
        if (final.protocol !== 'https:') return 'ignorada';
        const porta = final.port === '' ? 443 : Number(final.port);
        const dados = await deps.sondaTls({ host: final.hostname, porta });
        await emitirConstatacoes(analisarTls(dados, new Date()));
        return undefined;
      });

      // 4. Flags de cookies
      await etapa(3, false, async () => emitirConstatacoes(analisarCookies(coletada)));

      // 5. Exposição de versão
      await etapa(4, false, async () => emitirConstatacoes(analisarExposicaoDeVersao(coletada)));

      // 6. Análise e deduplicação (a deduplicação em si acontece na API)
      await conferirContinuidade();
      await atualizarEtapa(5, 'EM_EXECUCAO');
      await emitir({ tipo: 'analise-iniciada' });
      await atualizarEtapa(5, 'CONCLUIDA');
      await emitir({ tipo: 'avaliacao-finalizada' });
    } catch (erro) {
      await drenar().catch(() => undefined);
      if (erro instanceof AvaliacaoCancelada) return;
      const motivo = erro instanceof TempoMaximoExcedido ? 'Tempo máximo do perfil excedido.' : mensagemDoErro(erro);
      await emitir({ tipo: 'avaliacao-falhou', motivo });
    }
  }

  return { executar };
}
