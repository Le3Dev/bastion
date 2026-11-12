import { resolveTxt } from 'node:dns/promises';
import { FILAS } from '@bastion/contratos';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { criarCancelamento } from './cancelamento';
import { lerConfig, type ConfigDoWorker } from './config';
import { criarClienteHttp } from './guardiao-de-escopo/cliente-http';
import { LimitadorDeTaxa } from './guardiao-de-escopo/limitador-de-taxa';
import { sondarTls } from './guardiao-de-escopo/sonda-tls';
import { PublicadorDeResultados } from './resultados';
import { criarEntregadorDeWebhook } from './tarefas/entregar-webhook';
import { criarExecutorDeAvaliacao } from './tarefas/executar-avaliacao';
import { criarVerificadorDePropriedade } from './tarefas/verificar-propriedade';

const CONCORRENCIA_DE_VERIFICACOES = 4;
const CONCORRENCIA_DE_WEBHOOKS = 4;

const registrar = (mensagem: string): void => {
  console.log(`[worker ${new Date().toISOString()}] ${mensagem}`);
};

/** Confere se o Redis responde antes de subir os workers, com uma mensagem clara se estiver fora. */
async function conferirRedis(url: string): Promise<void> {
  const teste = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  teste.on('error', () => undefined);
  try {
    await teste.connect();
    await teste.ping();
  } catch {
    throw new Error(`Não foi possível conectar ao Redis em ${url}; rode \`pnpm infra:subir\`.`);
  } finally {
    teste.disconnect();
  }
}

async function iniciar(config: ConfigDoWorker): Promise<void> {
  await conferirRedis(config.redisUrl);

  // BullMQ exige maxRetriesPerRequest nulo nas conexões dos workers.
  const conexao = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  conexao.on('error', (erro: Error) => registrar(`Erro na conexão com o Redis: ${erro.message}`));

  const filaDeResultados = new Queue(FILAS.resultados, {
    connection: conexao,
    defaultJobOptions: { removeOnComplete: { age: 3600, count: 5000 }, removeOnFail: { age: 24 * 3600 } },
  });
  const publicador = new PublicadorDeResultados(filaDeResultados);

  const clienteHttp = criarClienteHttp({
    permitirRedesPrivadas: config.permitirRedesPrivadas,
    limitador: new LimitadorDeTaxa(config.requisicoesPorSegundo),
  });

  const executor = criarExecutorDeAvaliacao({
    clienteHttp,
    sondaTls: (alvo) => sondarTls({ ...alvo, permitirRedesPrivadas: config.permitirRedesPrivadas }),
    publicador,
    cancelamento: criarCancelamento(conexao),
    relogio: () => Date.now(),
    requisicoesPorSegundoMaximo: config.requisicoesPorSegundo,
  });
  const verificador = criarVerificadorDePropriedade({
    clienteHttp,
    resolverTxt: (nome) => resolveTxt(nome),
  });
  const entregador = criarEntregadorDeWebhook({ clienteHttp, publicador });

  const workers = [
    new Worker(FILAS.avaliacoes, async (job) => executor.executar(job.data), {
      connection: conexao,
      concurrency: config.concorrenciaDeAvaliacoes,
    }),
    // O resultado volta como valor de retorno: a API espera com waitUntilFinished.
    new Worker(FILAS.verificacoes, async (job) => verificador.verificar(job.data), {
      connection: conexao,
      concurrency: CONCORRENCIA_DE_VERIFICACOES,
    }),
    new Worker(FILAS.webhooks, async (job) => entregador.entregar(job.data), {
      connection: conexao,
      concurrency: CONCORRENCIA_DE_WEBHOOKS,
    }),
  ];
  for (const worker of workers) {
    worker.on('error', (erro: Error) => registrar(`Erro no worker ${worker.name}: ${erro.message}`));
    worker.on('failed', (job, erro: Error) =>
      registrar(`Tarefa ${job?.id ?? '?'} da fila ${worker.name} falhou: ${erro.message}`),
    );
  }

  registrar(
    `Worker iniciado: avaliações (concorrência ${config.concorrenciaDeAvaliacoes}), verificações e webhooks.`,
  );

  let encerrando = false;
  const encerrar = async (sinal: string): Promise<void> => {
    if (encerrando) return;
    encerrando = true;
    registrar(`${sinal} recebido; encerrando com graça.`);
    try {
      await Promise.all(workers.map((worker) => worker.close()));
      await filaDeResultados.close();
      await clienteHttp.fechar();
      await conexao.quit();
      registrar('Worker encerrado.');
      process.exit(0);
    } catch (erro) {
      registrar(`Falha ao encerrar: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`);
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void encerrar('SIGINT'));
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
}

try {
  await iniciar(lerConfig());
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : 'Falha desconhecida ao iniciar o worker.');
  process.exit(1);
}
