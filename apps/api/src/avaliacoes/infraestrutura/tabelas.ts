import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { organizacoes } from '../../contas/infraestrutura/tabelas'
import { sistemas } from '../../sistemas/infraestrutura/tabelas'

type PerfilDeAvaliacao = 'PASSIVO' | 'PADRAO' | 'COMPLETO' | 'IA'
type OrigemDaAvaliacao = 'WEB' | 'API' | 'CI' | 'AGENDA'
type EstadoDaAvaliacao =
  | 'RASCUNHO'
  | 'AGUARDANDO_VERIFICACAO'
  | 'NA_FILA'
  | 'PREPARANDO'
  | 'EM_EXECUCAO'
  | 'ANALISANDO'
  | 'CONCLUIDA'
  | 'FALHOU'
  | 'CANCELADA'
type EstadoDaEtapa = 'PENDENTE' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'FALHOU' | 'IGNORADA'
type DecisaoDoGuardiao = 'PERMITIDA' | 'BLOQUEADA'

export const avaliacoes = pgTable(
  'avaliacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    sistemaId: uuid('sistema_id').notNull().references(() => sistemas.id),
    perfil: text('perfil').$type<PerfilDeAvaliacao>().notNull(),
    origem: text('origem').$type<OrigemDaAvaliacao>().notNull(),
    estado: text('estado').$type<EstadoDaAvaliacao>().notNull(),
    notaMinima: integer('nota_minima').notNull(),
    nota: integer('nota'),
    solicitadaPor: text('solicitada_por').notNull(),
    solicitadaEm: timestamp('solicitada_em', { withTimezone: true }).notNull().defaultNow(),
    iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
    estadoDesde: timestamp('estado_desde', { withTimezone: true }).notNull().defaultNow(),
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
    motivoDaFalha: text('motivo_da_falha'),
    achadoRevalidadoId: uuid('achado_revalidado_id'),
    autorizacao: jsonb('autorizacao').$type<{ responsavel: string; referencia: string; concedidaEm?: string }>(),
    permitirCriacaoDeDados: boolean('permitir_criacao_de_dados').notNull().default(false),
  },
  (t) => [
    index('avaliacoes_organizacao_solicitada_idx').on(t.organizacaoId, t.solicitadaEm.desc()),
    index('avaliacoes_sistema_idx').on(t.sistemaId),
  ],
)

export const etapasDaAvaliacao = pgTable(
  'etapas_da_avaliacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    avaliacaoId: uuid('avaliacao_id').notNull().references(() => avaliacoes.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    nome: text('nome').notNull(),
    estado: text('estado').$type<EstadoDaEtapa>().notNull(),
    progresso: integer('progresso').notNull().default(0),
  },
  (t) => [unique('etapas_da_avaliacao_ordem_unica').on(t.avaliacaoId, t.ordem)],
)

export const requisicoesDoGuardiao = pgTable(
  'requisicoes_do_guardiao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    avaliacaoId: uuid('avaliacao_id').notNull().references(() => avaliacoes.id, { onDelete: 'cascade' }),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
    metodo: text('metodo').notNull(),
    url: text('url').notNull(),
    decisao: text('decisao').$type<DecisaoDoGuardiao>().notNull(),
    motivo: text('motivo').notNull(),
    status: integer('status'),
  },
  (t) => [index('requisicoes_do_guardiao_avaliacao_idx').on(t.avaliacaoId, t.em)],
)
