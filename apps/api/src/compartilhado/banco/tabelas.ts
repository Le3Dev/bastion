import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// GLOBAL, sem RLS: outbox lido pelo publicador, que atravessa organizações.
export const eventosDeSaida = pgTable(
  'eventos_de_saida',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull(),
    tipo: text('tipo').notNull(),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull(),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull().defaultNow(),
    publicadoEm: timestamp('publicado_em', { withTimezone: true }),
    tentativas: integer('tentativas').notNull().default(0),
  },
  (t) => [
    index('eventos_de_saida_pendentes_idx')
      .on(t.ocorridoEm)
      .where(sql`${t.publicadoEm} is null`),
  ],
)

// GLOBAL, sem RLS: garante a idempotência dos eventos consumidos pelo worker.
export const eventosProcessados = pgTable('eventos_processados', {
  idDoEvento: uuid('id_do_evento').primaryKey(),
  processadoEm: timestamp('processado_em', { withTimezone: true }).notNull().defaultNow(),
})
