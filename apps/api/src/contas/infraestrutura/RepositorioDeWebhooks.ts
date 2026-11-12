import { and, desc, eq } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { webhooks } from '../../compartilhado/banco/esquema';
import { WebhookDeSaida } from '../dominio/WebhookDeSaida';

export class RepositorioDeWebhooks {
  async inserir(tx: Transacao, webhook: WebhookDeSaida): Promise<void> {
    await tx.insert(webhooks).values(webhook.paraDados());
  }

  async salvar(tx: Transacao, webhook: WebhookDeSaida): Promise<void> {
    const dados = webhook.paraDados();
    await tx
      .update(webhooks)
      .set({ ativo: dados.ativo, ultimoEnvioEm: dados.ultimoEnvioEm })
      .where(eq(webhooks.id, dados.id));
  }

  async buscarPorId(tx: Transacao, organizacaoId: string, id: string): Promise<WebhookDeSaida | null> {
    const [linha] = await tx
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.organizacaoId, organizacaoId)))
      .limit(1);
    return linha ? WebhookDeSaida.reconstituir(linha) : null;
  }

  async listar(tx: Transacao, organizacaoId: string): Promise<WebhookDeSaida[]> {
    const linhas = await tx
      .select()
      .from(webhooks)
      .where(eq(webhooks.organizacaoId, organizacaoId))
      .orderBy(desc(webhooks.criadoEm));
    return linhas.map((linha) => WebhookDeSaida.reconstituir(linha));
  }

  async remover(tx: Transacao, organizacaoId: string, id: string): Promise<void> {
    await tx.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.organizacaoId, organizacaoId)));
  }
}
