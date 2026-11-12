import { boolean, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

type Papel = 'DONO' | 'ADMIN' | 'ANALISTA' | 'DESENVOLVEDOR' | 'LEITOR'
type EstadoDoMembro = 'ATIVO' | 'CONVIDADO' | 'REMOVIDO'
type EstadoDaEntrega = 'PENDENTE' | 'ENTREGUE' | 'FALHOU'

export const organizacoes = pgTable('organizacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  plano: text('plano').notNull().default('PROFISSIONAL'),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
})

// GLOBAL, sem RLS
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  nome: text('nome').notNull(),
  hashDaSenha: text('hash_da_senha').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const membros = pgTable(
  'membros',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    email: text('email').notNull(),
    nome: text('nome'),
    papel: text('papel').$type<Papel>().notNull(),
    estado: text('estado').$type<EstadoDoMembro>().notNull(),
    hashDoTokenDeConvite: text('hash_do_token_de_convite'),
    desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('membros_organizacao_email_unico').on(t.organizacaoId, t.email),
    index('membros_usuario_idx').on(t.usuarioId),
  ],
)

// GLOBAL, sem RLS
export const sessoes = pgTable(
  'sessoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hashDoToken: text('hash_do_token').notNull().unique(),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    ultimoUsoEm: timestamp('ultimo_uso_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessoes_usuario_idx').on(t.usuarioId)],
)

// GLOBAL, sem RLS: consultada antes de existir o contexto da organização
export const chavesDeApi = pgTable(
  'chaves_de_api',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    nome: text('nome').notNull(),
    prefixo: text('prefixo').notNull().unique(),
    hashDoSegredo: text('hash_do_segredo').notNull().unique(),
    papel: text('papel').$type<Papel>().notNull(),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    ultimoUsoEm: timestamp('ultimo_uso_em', { withTimezone: true }),
    revogadaEm: timestamp('revogada_em', { withTimezone: true }),
  },
  (t) => [index('chaves_de_api_organizacao_idx').on(t.organizacaoId)],
)

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    url: text('url').notNull(),
    eventos: text('eventos').array().notNull(),
    segredo: text('segredo').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    ultimoEnvioEm: timestamp('ultimo_envio_em', { withTimezone: true }),
  },
  (t) => [index('webhooks_organizacao_idx').on(t.organizacaoId)],
)

export const entregasDeWebhook = pgTable(
  'entregas_de_webhook',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
    eventoId: uuid('evento_id').notNull(),
    tipoDoEvento: text('tipo_do_evento').notNull(),
    estado: text('estado').$type<EstadoDaEntrega>().notNull(),
    tentativas: integer('tentativas').notNull().default(0),
    ultimoStatus: integer('ultimo_status'),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('entregas_de_webhook_organizacao_idx').on(t.organizacaoId, t.criadaEm.desc()),
    index('entregas_de_webhook_webhook_idx').on(t.webhookId),
  ],
)
