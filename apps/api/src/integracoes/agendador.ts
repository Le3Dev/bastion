import { Worker } from 'bullmq';
import {
  FILA_DE_AGENDAMENTOS,
  opcoesDeConexaoDoBullmq,
  TarefaDeAgendamentoEsquema,
} from './filas';

/** O que o agendador precisa dos serviços (interface mínima, para não acoplar a `Servicos`). */
export interface AlvoDoAgendador {
  dispararAgendamento(organizacaoId: string, agendamentoId: string): Promise<unknown>;
}

/** Valida o job e o entrega ao serviço dono da regra. Exportada para os testes. */
export const tratarDisparoDeAgendamento = async (
  alvo: AlvoDoAgendador,
  bruta: unknown,
): Promise<void> => {
  const tarefa = TarefaDeAgendamentoEsquema.parse(bruta);
  await alvo.dispararAgendamento(tarefa.organizacaoId, tarefa.agendamentoId);
};

export interface ProcessadorDeAgendamentos {
  fechar(): Promise<void>;
}

/**
 * Processa a fila `agendamentos`: cada disparo do agendador recorrente cria (ou pula, se o plano
 * estourou) UMA avaliação, já no contexto da organização do agendamento.
 */
export const iniciarProcessadorDeAgendamentos = (
  alvo: AlvoDoAgendador,
  redisUrl: string,
  registrarErro: (mensagem: string, erro: unknown) => void = (mensagem, erro) =>
    console.error(mensagem, erro),
): ProcessadorDeAgendamentos => {
  const worker = new Worker(
    FILA_DE_AGENDAMENTOS,
    async (job) => tratarDisparoDeAgendamento(alvo, job.data),
    { connection: opcoesDeConexaoDoBullmq(redisUrl), concurrency: 2 },
  );
  worker.on('error', (erro) => registrarErro('Erro no processador de agendamentos.', erro));
  worker.on('failed', (job, erro) =>
    registrarErro(`Falha no disparo do agendamento ${job?.id ?? '(sem id)'}.`, erro),
  );
  return { fechar: () => worker.close() };
};
