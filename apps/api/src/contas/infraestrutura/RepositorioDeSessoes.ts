import { eq } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { sessoes } from '../../compartilhado/banco/esquema';

export interface SessaoRegistrada {
  id: string;
  usuarioId: string;
  organizacaoId: string;
  expiraEm: Date;
  ultimoUsoEm: Date;
}

/** Sessões são globais: a busca por hash acontece antes de existir contexto de organização. */
export class RepositorioDeSessoes {
  async criar(
    tx: Transacao,
    dados: {
      hashDoToken: string;
      usuarioId: string;
      organizacaoId: string;
      criadaEm: Date;
      expiraEm: Date;
    },
  ): Promise<void> {
    await tx.insert(sessoes).values({ ...dados, ultimoUsoEm: dados.criadaEm });
  }

  async buscarPorHash(tx: Transacao, hashDoToken: string): Promise<SessaoRegistrada | null> {
    const [linha] = await tx
      .select({
        id: sessoes.id,
        usuarioId: sessoes.usuarioId,
        organizacaoId: sessoes.organizacaoId,
        expiraEm: sessoes.expiraEm,
        ultimoUsoEm: sessoes.ultimoUsoEm,
      })
      .from(sessoes)
      .where(eq(sessoes.hashDoToken, hashDoToken))
      .limit(1);
    return linha ?? null;
  }

  async registrarUso(tx: Transacao, id: string, agora: Date): Promise<void> {
    await tx.update(sessoes).set({ ultimoUsoEm: agora }).where(eq(sessoes.id, id));
  }

  async removerPorHash(tx: Transacao, hashDoToken: string): Promise<void> {
    await tx.delete(sessoes).where(eq(sessoes.hashDoToken, hashDoToken));
  }
}
