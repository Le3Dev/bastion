import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organizacoes } from '../../contas/infraestrutura/tabelas'
import { sistemas } from '../../sistemas/infraestrutura/tabelas'

type PerfilDeAvaliacao = 'PASSIVO' | 'PADRAO' | 'COMPLETO' | 'IA'
type FrequenciaDaAgenda = 'DIARIA' | 'SEMANAL' | 'MENSAL'
type AutorizacaoSalva = { responsavel: string; referencia: string }

export const agendamentos = pgTable(
  'agendamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    sistemaId: uuid('sistema_id').notNull().references(() => sistemas.id),
    perfil: text('perfil').$type<PerfilDeAvaliacao>().notNull(),
    notaMinima: integer('nota_minima').notNull(),
    frequencia: text('frequencia').$type<FrequenciaDaAgenda>().notNull(),
    horario: text('horario').notNull(),
    diaDaSemana: integer('dia_da_semana'),
    diaDoMes: integer('dia_do_mes'),
    autorizacao: jsonb('autorizacao').$type<AutorizacaoSalva>(),
    permitirCriacaoDeDados: boolean('permitir_criacao_de_dados').notNull().default(false),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull(),
  },
  (t) => [index('agendamentos_organizacao_idx').on(t.organizacaoId)],
)
