import { eq } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { usuarios } from '../../compartilhado/banco/esquema';
import { Usuario } from '../dominio/Usuario';

export interface UsuarioComSenha {
  usuario: Usuario;
  hashDaSenha: string;
}

/** Usuários são globais (sem RLS): a pessoa pode pertencer a várias organizações. */
export class RepositorioDeUsuarios {
  async buscarPorEmail(tx: Transacao, email: string): Promise<UsuarioComSenha | null> {
    const [linha] = await tx.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
    return linha ? this.mapear(linha) : null;
  }

  async buscarPorId(tx: Transacao, id: string): Promise<UsuarioComSenha | null> {
    const [linha] = await tx.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
    return linha ? this.mapear(linha) : null;
  }

  async inserir(tx: Transacao, usuario: Usuario, hashDaSenha: string): Promise<void> {
    const dados = usuario.paraDados();
    await tx
      .insert(usuarios)
      .values({ id: dados.id, email: dados.email, nome: dados.nome, hashDaSenha });
  }

  private mapear(linha: typeof usuarios.$inferSelect): UsuarioComSenha {
    return {
      usuario: Usuario.reconstituir({ id: linha.id, email: linha.email, nome: linha.nome }),
      hashDaSenha: linha.hashDaSenha,
    };
  }
}
