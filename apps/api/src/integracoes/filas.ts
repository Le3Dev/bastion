import {
  chaveDeCancelamento,
  FILAS,
  ResultadoDaVerificacao,
  type TarefaEntregarWebhook,
  type TarefaExecutarAvaliacao,
  type TarefaVerificarPropriedade,
} from '@bastion/contratos';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

/** A fila não devolveu o resultado dentro do prazo (o worker pode estar parado). */
export class ErroDeTempoEsgotadoDaFila extends Error {
  constructor(mensagem = 'A fila não respondeu a tempo.') {
    super(mensagem);
    this.name = 'ErroDeTempoEsgotadoDaFila';
  }
}

/** Fila interna, processada pela própria API: tarefas atrasadas de vigilância (prazos). */
export const FILA_DE_VIGILANCIA = 'vigilancia';

export type TarefaDeVigilancia =
  | { tipo: 'tempo-limite-da-avaliacao'; avaliacaoId: string; organizacaoId: string }
  | { tipo: 'vencimento-do-risco'; achadoId: string; organizacaoId: string };

export const TarefaDeVigilanciaEsquema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('tempo-limite-da-avaliacao'),
    avaliacaoId: z.string(),
    organizacaoId: z.string(),
  }),
  z.object({
    tipo: z.literal('vencimento-do-risco'),
    achadoId: z.string(),
    organizacaoId: z.string(),
  }),
]) satisfies z.ZodType<TarefaDeVigilancia>;

/** Id determinístico: repetir o mesmo agendamento (mesma tarefa e atraso) não duplica o job. */
export const idDaVigilancia = (tarefa: TarefaDeVigilancia, atrasoMs: number): string => {
  const alvo = tarefa.tipo === 'tempo-limite-da-avaliacao' ? tarefa.avaliacaoId : tarefa.achadoId;
  return `${tarefa.tipo}-${alvo}-${Math.round(atrasoMs)}`;
};

/** Fachada para o worker: o resto da API só conhece esta interface (camada anticorrupção). */
export interface Filas {
  enfileirarVerificacao(tarefa: TarefaVerificarPropriedade): Promise<ResultadoDaVerificacao>;
  enfileirarAvaliacao(tarefa: TarefaExecutarAvaliacao): Promise<void>;
  enfileirarEntregaDeWebhook(tarefa: TarefaEntregarWebhook): Promise<void>;
  /** Agenda uma verificação de prazo para daqui a `atrasoMs` (fila `vigilancia`, tratada pela API). */
  agendarVigilancia(tarefa: TarefaDeVigilancia, atrasoMs: number): Promise<void>;
  /** Grava o sinal de cancelamento no Redis (TTL de 1 hora); o worker o consulta entre requisições. */
  sinalizarCancelamento(avaliacaoId: string): Promise<void>;
  /** Falha se o Redis não responder. */
  verificarSaude(): Promise<void>;
  fechar(): Promise<void>;
}

export const PRAZO_DA_VERIFICACAO_EM_MS = 20_000;
const TTL_DO_CANCELAMENTO_EM_SEGUNDOS = 3600;

export const opcoesDeConexaoDoBullmq = (redisUrl: string) => ({
  url: redisUrl,
  maxRetriesPerRequest: null,
});

export const criarFilas = (redisUrl: string): Filas => {
  const conexao = opcoesDeConexaoDoBullmq(redisUrl);
  const filaDeVerificacoes = new Queue(FILAS.verificacoes, { connection: conexao });
  const filaDeAvaliacoes = new Queue(FILAS.avaliacoes, { connection: conexao });
  const filaDeWebhooks = new Queue(FILAS.webhooks, { connection: conexao });
  const filaDeVigilancia = new Queue(FILA_DE_VIGILANCIA, { connection: conexao });
  const eventosDeVerificacoes = new QueueEvents(FILAS.verificacoes, { connection: conexao });
  const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
  redis.on('error', () => {
    // Os erros aparecem nas chamadas (saúde, cancelamento); evita "unhandled error event".
  });
  for (const fila of [filaDeVerificacoes, filaDeAvaliacoes, filaDeWebhooks, filaDeVigilancia]) {
    fila.on('error', () => undefined);
  }
  eventosDeVerificacoes.on('error', () => undefined);

  return {
    async enfileirarVerificacao(tarefa) {
      await eventosDeVerificacoes.waitUntilReady();
      const job = await filaDeVerificacoes.add('verificar-propriedade', tarefa, {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      try {
        const resultado: unknown = await job.waitUntilFinished(
          eventosDeVerificacoes,
          PRAZO_DA_VERIFICACAO_EM_MS,
        );
        return ResultadoDaVerificacao.parse(resultado);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        if (/timed out/i.test(mensagem)) throw new ErroDeTempoEsgotadoDaFila(mensagem);
        return { verificado: false, mensagem: `A verificação não pôde ser concluída: ${mensagem}` };
      }
    },

    async enfileirarAvaliacao(tarefa) {
      await filaDeAvaliacoes.add('executar-avaliacao', tarefa, {
        jobId: tarefa.avaliacaoId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      });
    },

    async enfileirarEntregaDeWebhook(tarefa) {
      await filaDeWebhooks.add('entregar-webhook', tarefa, {
        jobId: tarefa.entregaId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
    },

    async agendarVigilancia(tarefa, atrasoMs) {
      await filaDeVigilancia.add('vigiar', tarefa, {
        jobId: idDaVigilancia(tarefa, atrasoMs),
        delay: Math.max(0, Math.round(atrasoMs)),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    },

    async sinalizarCancelamento(avaliacaoId) {
      await redis.set(chaveDeCancelamento(avaliacaoId), '1', 'EX', TTL_DO_CANCELAMENTO_EM_SEGUNDOS);
    },

    async verificarSaude() {
      await redis.ping();
    },

    async fechar() {
      await Promise.allSettled([
        filaDeVerificacoes.close(),
        filaDeAvaliacoes.close(),
        filaDeWebhooks.close(),
        filaDeVigilancia.close(),
        eventosDeVerificacoes.close(),
      ]);
      redis.disconnect();
    },
  };
};
