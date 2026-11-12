import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { avaliacoes } from '../../avaliacoes/infraestrutura/tabelas'
import { organizacoes } from '../../contas/infraestrutura/tabelas'
import { sistemas } from '../../sistemas/infraestrutura/tabelas'

export const relatorios = pgTable(
  'relatorios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    avaliacaoId: uuid('avaliacao_id').notNull().unique().references(() => avaliacoes.id),
    sistemaId: uuid('sistema_id').notNull().references(() => sistemas.id),
    geradoEm: timestamp('gerado_em', { withTimezone: true }).notNull().defaultNow(),
    nota: integer('nota').notNull(),
    resumo: text('resumo').notNull(),
    chaveDoPdf: text('chave_do_pdf'),
  },
  (t) => [index('relatorios_organizacao_idx').on(t.organizacaoId, t.geradoEm.desc())],
)
