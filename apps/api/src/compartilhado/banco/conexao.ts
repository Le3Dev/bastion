import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as esquema from './esquema';

export type Banco = NodePgDatabase<typeof esquema>;
export type Transacao = Parameters<Parameters<Banco['transaction']>[0]>[0];

export interface Conexao {
  db: Banco;
  pool: pg.Pool;
  fechar(): Promise<void>;
}

export const criarConexao = (urlDoBanco: string): Conexao => {
  const pool = new pg.Pool({ connectionString: urlDoBanco, max: 10 });
  // Evita derrubar o processo quando uma conexão ociosa cai.
  pool.on('error', (erro) => {
    console.error(`Conexão ociosa com o Postgres falhou: ${erro.message}`);
  });
  const db: Banco = drizzle(pool, { schema: esquema });
  return { db, pool, fechar: () => pool.end() };
};

/** Executa `fn` numa transação cujo RLS enxerga só a organização informada. */
export const emContextoDaOrganizacao = <T>(
  db: Banco,
  organizacaoId: string,
  fn: (tx: Transacao) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organizacao_id', ${organizacaoId}, true)`);
    return fn(tx);
  });

/** Executa `fn` numa transação em que só os vínculos (`membros`) do usuário ficam visíveis. */
export const emContextoDoUsuario = <T>(
  db: Banco,
  usuarioId: string,
  fn: (tx: Transacao) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.usuario_id', ${usuarioId}, true)`);
    return fn(tx);
  });

/** Transação sem contexto: só serve para as tabelas globais (sem RLS). */
export const semContexto = <T>(db: Banco, fn: (tx: Transacao) => Promise<T>): Promise<T> =>
  db.transaction((tx) => fn(tx));

/** Detecta violação de unicidade do Postgres, inclusive embrulhada pelo Drizzle. */
export const ehViolacaoDeUnicidade = (erro: unknown): boolean => {
  let atual: unknown = erro;
  for (let i = 0; i < 4 && typeof atual === 'object' && atual !== null; i++) {
    if ('code' in atual && (atual as { code: unknown }).code === '23505') return true;
    atual = 'cause' in atual ? (atual as { cause: unknown }).cause : undefined;
  }
  return false;
};
