import { and, eq, sql } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { entregasDeWebhook } from '../../compartilhado/banco/esquema';

export interface EntregaDeWebhook {
  id: string;
  organizacaoId: string;
  webhookId: string;
  eventoId: string;
  tipoDoEvento: string;
  estado: 'PENDENTE' | 'ENTREGUE' | 'FALHOU';
  tentativas: number;
  ultimoStatus: number | null;
}

export class RepositorioDeEntregasDeWebhook {
  async criar(
    tx: Transacao,
    dados: {
      id: string;
      organizacaoId: string;
      webhookId: string;
      eventoId: string;
      tipoDoEvento: string;
      criadaEm: Date;
    },
  ): Promise<void> {
    await tx.insert(entregasDeWebhook).values({
      ...dados,
      estado: 'PENDENTE',
      tentativas: 0,
      atualizadaEm: dados.criadaEm,
    });
  }

  async buscarPorWebhookEEvento(
    tx: Transacao,
    webhookId: string,
    eventoId: string,
  ): Promise<EntregaDeWebhook | null> {
    const [linha] = await tx
      .select()
      .from(entregasDeWebhook)
      .where(and(eq(entregasDeWebhook.webhookId, webhookId), eq(entregasDeWebhook.eventoId, eventoId)))
      .limit(1);
    return linha ?? null;
  }

  async buscarPorId(tx: Transacao, id: string): Promise<EntregaDeWebhook | null> {
    const [linha] = await tx
      .select()
      .from(entregasDeWebhook)
      .where(eq(entregasDeWebhook.id, id))
      .limit(1);
    return linha ?? null;
  }

  async registrarResultado(
    tx: Transacao,
    id: string,
    resultado: { sucesso: boolean; status: number | null; agora: Date },
  ): Promise<void> {
    await tx
      .update(entregasDeWebhook)
      .set({
        estado: resultado.sucesso ? 'ENTREGUE' : 'FALHOU',
        ultimoStatus: resultado.status,
        tentativas: sql`${entregasDeWebhook.tentativas} + 1`,
        atualizadaEm: resultado.agora,
      })
      .where(eq(entregasDeWebhook.id, id));
  }
}
