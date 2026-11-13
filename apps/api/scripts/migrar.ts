import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

async function principal(): Promise<void> {
  const teste = process.argv.includes('--teste')
  const nomeDaVariavel = teste ? 'DATABASE_URL_TESTE_MIGRACAO' : 'DATABASE_URL_MIGRACAO'
  const url = process.env[nomeDaVariavel]
  if (!url) {
    throw new Error(`Variável ${nomeDaVariavel} não definida. Copie .env.example para .env.`)
  }

  const pool = new pg.Pool({ connectionString: url })
  try {
    // Mesma posição relativa em scripts/ (tsx) e dist/ (bundle); MIGRACOES_DIR sobrescreve.
    const raiz = process.env.MIGRACOES_DIR ?? join(import.meta.dirname, '..', 'migracoes')

    console.log('Aplicando migrações geradas...')
    await migrate(drizzle(pool), { migrationsFolder: join(raiz, 'geradas') })

    const pastaManual = join(raiz, 'manuais')
    const arquivos = (await readdir(pastaManual)).filter((nome) => nome.endsWith('.sql')).sort()
    for (const arquivo of arquivos) {
      console.log(`Aplicando ${arquivo}...`)
      const sql = await readFile(join(pastaManual, arquivo), 'utf8')
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        await cliente.query(sql)
        await cliente.query('COMMIT')
      } catch (erro) {
        await cliente.query('ROLLBACK')
        throw erro
      } finally {
        cliente.release()
      }
    }
    console.log('Banco pronto.')
  } finally {
    await pool.end()
  }
}

try {
  await principal()
} catch (erro) {
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  console.error(`Falha ao migrar o banco: ${mensagem}`)
  process.exitCode = 1
}
