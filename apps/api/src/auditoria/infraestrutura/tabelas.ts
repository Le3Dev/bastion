import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organizacoes } from '../../contas/infraestrutura/tabelas'

type TipoDeAtor = 'USUARIO' | 'SISTEMA' | 'CHAVE_DE_API'

export const registrosDeAuditoria = pgTable(
  'registros_de_auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
    atorTipo: text('ator_tipo').$type<TipoDeAtor>().notNull(),
    atorId: uuid('ator_id'),
    atorNome: text('ator_nome').notNull(),
    acao: text('acao').notNull(),
    alvo: text('alvo').notNull(),
    detalhe: jsonb('detalhe').$type<Record<string, unknown>>(),
  },
  (t) => [index('registros_de_auditoria_organizacao_idx').on(t.organizacaoId, t.em.desc())],
)
