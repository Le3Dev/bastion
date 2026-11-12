import { EventoDeResultado, FILAS } from '@bastion/contratos';
import { Worker } from 'bullmq';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../compartilhado/banco/conexao';
import { eventosProcessados } from '../compartilhado/banco/tabelas';
import { opcoesDeConexaoDoBullmq } from './filas';

type TipoDeResultado = EventoDeResultado['tipo'];
export type EventoDeResultadoDoTipo<T extends TipoDeResultado> = Extract<
  EventoDeResultado,
  { tipo: T }
>;

/** Função executada DEPOIS do commit (por exemplo, para publicar via SSE). */
export type AposOCommit = () => void | Promise<void>;

export type ManipuladorDeResultado<T extends TipoDeResultado> = (
  evento: EventoDeResultadoDoTipo<T>,
  tx: Transacao,
) => Promise<AposOCommit | void>;

type ManipuladorGenerico = (
  evento: EventoDeResultado,
  tx: Transacao,
) => Promise<AposOCommit | void>;

const manipuladores = new Map<TipoDeResultado, ManipuladorGenerico>();

/** Registra o manipulador de um tipo de evento vindo do worker (um por tipo; o último vence). */
export const registrarManipuladorDeResultado = <T extends TipoDeResultado>(
  tipo: T,
  fn: ManipuladorDeResultado<T>,
): void => {
  manipuladores.set(tipo, (evento, tx) => fn(evento as EventoDeResultadoDoTipo<T>, tx));
};

export type ResultadoDoProcessamento = 'processado' | 'duplicado' | 'sem-manipulador';

/**
 * Processa um evento do worker de forma idempotente: a mesma transação registra o `idDoEvento`
 * em `eventos_processados` e executa o manipulador. Exportada para os testes.
 */
export const processarResultado = async (
  db: Banco,
  bruto: unknown,
): Promise<ResultadoDoProcessamento> => {
  const evento = EventoDeResultado.parse(bruto);
  const manipulador = manipuladores.get(evento.tipo);
  if (!manipulador) return 'sem-manipulador';

  const aposOCommit = await emContextoDaOrganizacao(db, evento.organizacaoId, async (tx) => {
    const inseridos = await tx
      .insert(eventosProcessados)
      .values({ idDoEvento: evento.idDoEvento })
      .onConflictDoNothing()
      .returning({ idDoEvento: eventosProcessados.idDoEvento });
    if (inseridos.length === 0) return 'duplicado' as const;
    const posCommit = await manipulador(evento, tx);
    return typeof posCommit === 'function' ? posCommit : ('processado' as const);
  });

  if (aposOCommit === 'duplicado') return 'duplicado';
  if (typeof aposOCommit === 'function') await aposOCommit();
  return 'processado';
};

export interface ConsumidorDeResultados {
  fechar(): Promise<void>;
}

export const iniciarConsumidorDeResultados = (
  db: Banco,
  redisUrl: string,
  registrarErro: (mensagem: string, erro: unknown) => void = (mensagem, erro) =>
    console.error(mensagem, erro),
): ConsumidorDeResultados => {
  const worker = new Worker(
    FILAS.resultados,
    async (job) => {
      const resultado = await processarResultado(db, job.data);
      if (resultado === 'sem-manipulador') {
        registrarErro(`Nenhum manipulador registrado para o resultado ${String(job.name)}.`, null);
      }
    },
    { connection: opcoesDeConexaoDoBullmq(redisUrl), concurrency: 1 },
  );
  worker.on('error', (erro) => registrarErro('Erro no consumidor de resultados.', erro));
  worker.on('failed', (job, erro) =>
    registrarErro(`Falha ao processar o resultado ${job?.id ?? '(sem id)'}.`, erro),
  );
  return { fechar: () => worker.close() };
};
