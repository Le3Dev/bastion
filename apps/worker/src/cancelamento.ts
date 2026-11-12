import { chaveDeCancelamento } from '@bastion/contratos';

/** Parte do Redis que o cancelamento usa. */
export interface LeitorDeChaves {
  exists(chave: string): Promise<number>;
}

export interface Cancelamento {
  foiCancelada(avaliacaoId: string): Promise<boolean>;
}

/** A API publica `chaveDeCancelamento(id)` no Redis; o worker só confere se a chave existe. */
export async function foiCancelada(redis: LeitorDeChaves, avaliacaoId: string): Promise<boolean> {
  return (await redis.exists(chaveDeCancelamento(avaliacaoId))) > 0;
}

export function criarCancelamento(redis: LeitorDeChaves): Cancelamento {
  return { foiCancelada: (avaliacaoId) => foiCancelada(redis, avaliacaoId) };
}
