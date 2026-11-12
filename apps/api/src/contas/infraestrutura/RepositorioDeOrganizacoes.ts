import { and, asc, eq, inArray, ne, notInArray } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { membros, organizacoes } from '../../compartilhado/banco/esquema';
import { Organizacao } from '../dominio/Organizacao';
import type { DadosDoMembro } from '../dominio/Membro';

export interface VinculoDoUsuario {
  membroId: string;
  organizacaoId: string;
  papel: DadosDoMembro['papel'];
}

type LinhaDeMembro = typeof membros.$inferSelect;

const paraDadosDoMembro = (linha: LinhaDeMembro): DadosDoMembro => ({
  id: linha.id,
  usuarioId: linha.usuarioId,
  email: linha.email,
  nome: linha.nome,
  papel: linha.papel,
  estado: linha.estado === 'CONVIDADO' ? 'CONVIDADO' : 'ATIVO',
  desde: linha.desde,
});

/** Repositório do agregado Organizacao (raiz) com seus membros. */
export class RepositorioDeOrganizacoes {
  async buscarPorId(tx: Transacao, id: string): Promise<Organizacao | null> {
    const [linha] = await tx.select().from(organizacoes).where(eq(organizacoes.id, id)).limit(1);
    if (!linha) return null;
    const linhasDeMembros = await tx
      .select()
      .from(membros)
      .where(and(eq(membros.organizacaoId, id), ne(membros.estado, 'REMOVIDO')))
      .orderBy(asc(membros.desde));
    return Organizacao.reconstituir({
      id: linha.id,
      nome: linha.nome,
      criadaEm: linha.criadaEm,
      membros: linhasDeMembros.map(paraDadosDoMembro),
    });
  }

  /** Procura o membro convidado pelo hash do token de convite (requer o contexto da organização). */
  async buscarMembroPorHashDeConvite(
    tx: Transacao,
    hash: string,
  ): Promise<{ organizacaoId: string; membroId: string } | null> {
    const [linha] = await tx
      .select({ organizacaoId: membros.organizacaoId, membroId: membros.id })
      .from(membros)
      .where(and(eq(membros.hashDoTokenDeConvite, hash), eq(membros.estado, 'CONVIDADO')))
      .limit(1);
    return linha ?? null;
  }

  /** Vínculos ativos do usuário (requer o contexto do usuário). */
  async vinculosDoUsuario(tx: Transacao, usuarioId: string): Promise<VinculoDoUsuario[]> {
    return tx
      .select({ membroId: membros.id, organizacaoId: membros.organizacaoId, papel: membros.papel })
      .from(membros)
      .where(and(eq(membros.usuarioId, usuarioId), eq(membros.estado, 'ATIVO')))
      .orderBy(asc(membros.desde));
  }

  /** Insere a organização recém-fundada (o contexto já deve apontar para o id dela). */
  async inserir(tx: Transacao, organizacao: Organizacao): Promise<void> {
    const dados = organizacao.paraDados();
    await tx
      .insert(organizacoes)
      .values({ id: dados.id, nome: dados.nome, criadaEm: dados.criadaEm });
    await this.gravarMembros(tx, dados.id, dados.membros, new Map());
  }

  /**
   * Persiste o estado atual dos membros. `hashesDeConvite` informa o hash do token dos convites
   * criados nesta operação; convites aceitos têm o hash apagado.
   */
  async salvar(
    tx: Transacao,
    organizacao: Organizacao,
    hashesDeConvite: ReadonlyMap<string, string> = new Map(),
  ): Promise<void> {
    const dados = organizacao.paraDados();
    await tx.update(organizacoes).set({ nome: dados.nome }).where(eq(organizacoes.id, dados.id));
    const idsAtuais = dados.membros.map((m) => m.id);
    if (idsAtuais.length > 0) {
      await tx
        .delete(membros)
        .where(and(eq(membros.organizacaoId, dados.id), notInArray(membros.id, idsAtuais)));
    }
    await this.gravarMembros(tx, dados.id, dados.membros, hashesDeConvite);
  }

  async contarMembros(tx: Transacao, organizacaoId: string): Promise<number> {
    const linhas = await tx
      .select({ id: membros.id })
      .from(membros)
      .where(and(eq(membros.organizacaoId, organizacaoId), inArray(membros.estado, ['ATIVO', 'CONVIDADO'])));
    return linhas.length;
  }

  private async gravarMembros(
    tx: Transacao,
    organizacaoId: string,
    dados: readonly DadosDoMembro[],
    hashesDeConvite: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const membro of dados) {
      const hash = membro.estado === 'ATIVO' ? null : (hashesDeConvite.get(membro.id) ?? null);
      await tx
        .insert(membros)
        .values({
          id: membro.id,
          organizacaoId,
          usuarioId: membro.usuarioId,
          email: membro.email,
          nome: membro.nome,
          papel: membro.papel,
          estado: membro.estado,
          hashDoTokenDeConvite: hash,
          desde: membro.desde,
        })
        .onConflictDoUpdate({
          target: membros.id,
          set: {
            usuarioId: membro.usuarioId,
            nome: membro.nome,
            papel: membro.papel,
            estado: membro.estado,
            desde: membro.desde,
            ...(membro.estado === 'ATIVO' ? { hashDoTokenDeConvite: null } : {}),
            ...(hash !== null ? { hashDoTokenDeConvite: hash } : {}),
          },
        });
    }
  }
}
