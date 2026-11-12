import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { avaliacoes } from '../../avaliacoes/infraestrutura/tabelas'
import { organizacoes } from '../../contas/infraestrutura/tabelas'
import { sistemas } from '../../sistemas/infraestrutura/tabelas'

type Severidade = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA'
type EstadoDoAchado =
  | 'NOVO'
  | 'CONFIRMADO'
  | 'EM_CORRECAO'
  | 'REVALIDANDO'
  | 'CORRIGIDO'
  | 'REABERTO'
  | 'RISCO_ACEITO'

interface EvidenciaJson {
  requisicao: string
  resposta: string
  observacao: string
}
interface ConformidadeJson {
  owasp: string[]
  lgpd: string[]
}
interface RiscoAceitoJson {
  justificativa: string
  responsavel: string
  validoAte: string
}

export const achados = pgTable(
  'achados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    sistemaId: uuid('sistema_id').notNull().references(() => sistemas.id),
    impressaoDigital: text('impressao_digital').notNull(),
    tipo: text('tipo').notNull(),
    titulo: text('titulo').notNull(),
    severidade: text('severidade').$type<Severidade>().notNull(),
    estado: text('estado').$type<EstadoDoAchado>().notNull(),
    local: text('local').notNull(),
    descricao: text('descricao').notNull(),
    evidencia: jsonb('evidencia').$type<EvidenciaJson>().notNull(),
    correcaoSugerida: text('correcao_sugerida').notNull(),
    conformidade: jsonb('conformidade').$type<ConformidadeJson>().notNull(),
    ocorrencias: integer('ocorrencias').notNull().default(1),
    primeiraVezEm: timestamp('primeira_vez_em', { withTimezone: true }).notNull(),
    ultimaVezEm: timestamp('ultima_vez_em', { withTimezone: true }).notNull(),
    riscoAceito: jsonb('risco_aceito').$type<RiscoAceitoJson>(),
  },
  (t) => [
    unique('achados_impressao_digital_unica').on(t.organizacaoId, t.impressaoDigital),
    index('achados_organizacao_estado_idx').on(t.organizacaoId, t.estado),
    index('achados_sistema_idx').on(t.sistemaId),
  ],
)

export const ocorrenciasDoAchado = pgTable(
  'ocorrencias_do_achado',
  {
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    achadoId: uuid('achado_id').notNull().references(() => achados.id, { onDelete: 'cascade' }),
    avaliacaoId: uuid('avaliacao_id').notNull().references(() => avaliacoes.id, { onDelete: 'cascade' }),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.achadoId, t.avaliacaoId] }),
    index('ocorrencias_do_achado_avaliacao_idx').on(t.avaliacaoId),
  ],
)

export const historicoDoAchado = pgTable(
  'historico_do_achado',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    achadoId: uuid('achado_id').notNull().references(() => achados.id, { onDelete: 'cascade' }),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
    de: text('de').$type<EstadoDoAchado>(),
    para: text('para').$type<EstadoDoAchado>().notNull(),
    ator: text('ator').notNull(),
    comentario: text('comentario'),
  },
  (t) => [index('historico_do_achado_achado_idx').on(t.achadoId, t.em)],
)
