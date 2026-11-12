import { Worker } from 'bullmq';
import {
  FILA_DE_VIGILANCIA,
  opcoesDeConexaoDoBullmq,
  TarefaDeVigilanciaEsquema,
  type TarefaDeVigilancia,
} from './filas';

/** O que a vigilância precisa dos serviços (interface mínima, para não acoplar a `Servicos`). */
export interface AlvosDaVigilancia {
  verificarTempoLimiteDaAvaliacao(organizacaoId: string, avaliacaoId: string): Promise<void>;
  verificarVencimentoDoRisco(organizacaoId: string, achadoId: string): Promise<void>;
}

/** Despacha a tarefa de vigilância para o serviço dono da regra. Exportada para os testes. */
export const tratarVigilancia = async (
  alvos: AlvosDaVigilancia,
  bruta: unknown,
): Promise<void> => {
  const tarefa: TarefaDeVigilancia = TarefaDeVigilanciaEsquema.parse(bruta);
  switch (tarefa.tipo) {
    case 'tempo-limite-da-avaliacao':
      await alvos.verificarTempoLimiteDaAvaliacao(tarefa.organizacaoId, tarefa.avaliacaoId);
      return;
    case 'vencimento-do-risco':
      await alvos.verificarVencimentoDoRisco(tarefa.organizacaoId, tarefa.achadoId);
      return;
  }
};

export interface ProcessadorDeVigilancia {
  fechar(): Promise<void>;
}

/**
 * Processa a fila interna `vigilancia`. Cada job é uma verificação atrasada de UMA avaliação ou
 * UM achado, já no contexto da organização dele (o RLS impede varrer várias organizações).
 */
export const iniciarProcessadorDeVigilancia = (
  alvos: AlvosDaVigilancia,
  redisUrl: string,
  registrarErro: (mensagem: string, erro: unknown) => void = (mensagem, erro) =>
    console.error(mensagem, erro),
): ProcessadorDeVigilancia => {
  const worker = new Worker(FILA_DE_VIGILANCIA, async (job) => tratarVigilancia(alvos, job.data), {
    connection: opcoesDeConexaoDoBullmq(redisUrl),
    concurrency: 2,
  });
  worker.on('error', (erro) => registrarErro('Erro no processador de vigilância.', erro));
  worker.on('failed', (job, erro) =>
    registrarErro(`Falha na vigilância ${job?.id ?? '(sem id)'}.`, erro),
  );
  return { fechar: () => worker.close() };
};
