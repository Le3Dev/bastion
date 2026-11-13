import { defineConfig } from 'drizzle-kit'

// O .env fica na raiz do monorepo e pode não existir (ex.: variáveis já vêm do ambiente).
try {
  process.loadEnvFile('../../.env')
} catch {
  // sem .env: segue com as variáveis do ambiente
}

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/contas/infraestrutura/tabelas.ts',
    './src/sistemas/infraestrutura/tabelas.ts',
    './src/avaliacoes/infraestrutura/tabelas.ts',
    './src/agendamentos/infraestrutura/tabelas.ts',
    './src/achados/infraestrutura/tabelas.ts',
    './src/relatorios/infraestrutura/tabelas.ts',
    './src/auditoria/infraestrutura/tabelas.ts',
    './src/compartilhado/banco/tabelas.ts',
  ],
  out: './migracoes/geradas',
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRACAO ?? '',
  },
})
