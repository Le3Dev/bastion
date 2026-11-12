import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organizacoes } from '../../contas/infraestrutura/tabelas'

type CredencialDeTesteSalva = {
  modo: 'FORMULARIO' | 'JSON'
  urlDeLogin: string
  campoUsuario: string
  campoSenha: string
  indicadorDeSucesso: string
  segredoUsuarioCifrado: string
  segredoSenhaCifrado: string
}
type ConectorDeIaSalvo = {
  url: string
  modeloDoCorpo: string
  caminhoDaResposta: string
  frasesSigilosas: string[]
  cabecalhosCifrados: string | null
}

type TipoDeSistema = 'SITE' | 'API' | 'SISTEMA_INTERNO' | 'APP_COM_IA'
type MetodoDeVerificacao = 'DNS_TXT' | 'ARQUIVO_WELL_KNOWN' | 'CABECALHO_HTTP'
type EstadoDaVerificacao = 'PENDENTE' | 'VERIFICADO' | 'FALHOU' | 'EXPIRADO'

export const sistemas = pgTable(
  'sistemas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizacaoId: uuid('organizacao_id').notNull().references(() => organizacoes.id),
    nome: text('nome').notNull(),
    tipo: text('tipo').$type<TipoDeSistema>().notNull(),
    urlDeHomologacao: text('url_de_homologacao').notNull(),
    hostDeHomologacao: text('host_de_homologacao').notNull(),
    dominioDeProducao: text('dominio_de_producao').notNull(),
    verificacaoMetodo: text('verificacao_metodo').$type<MetodoDeVerificacao>().notNull(),
    verificacaoToken: text('verificacao_token').notNull(),
    verificacaoEstado: text('verificacao_estado').$type<EstadoDaVerificacao>().notNull(),
    verificacaoVerificadaEm: timestamp('verificacao_verificada_em', { withTimezone: true }),
    verificacaoExpiraEm: timestamp('verificacao_expira_em', { withTimezone: true }),
    verificacaoMensagem: text('verificacao_mensagem'),
    ultimaNota: integer('ultima_nota'),
    credencialDeTeste: jsonb('credencial_de_teste').$type<CredencialDeTesteSalva>(),
    conectorDeIa: jsonb('conector_de_ia').$type<ConectorDeIaSalvo>(),
    arquivadoEm: timestamp('arquivado_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sistemas_organizacao_idx').on(t.organizacaoId, t.criadoEm.desc())],
)
