import { z } from 'zod';

export const SEVERIDADES = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export const PAPEIS = ['DONO', 'ADMIN', 'ANALISTA', 'DESENVOLVEDOR', 'LEITOR'] as const;
export type Papel = (typeof PAPEIS)[number];

export const TIPOS_DE_SISTEMA = ['SITE', 'API', 'SISTEMA_INTERNO', 'APP_COM_IA'] as const;
export type TipoDeSistema = (typeof TIPOS_DE_SISTEMA)[number];

export const ORIGENS_DA_AVALIACAO = ['WEB', 'API', 'CI', 'AGENDA'] as const;
export type OrigemDaAvaliacao = (typeof ORIGENS_DA_AVALIACAO)[number];

export const FREQUENCIAS_DA_AGENDA = ['DIARIA', 'SEMANAL', 'MENSAL'] as const;
export type FrequenciaDaAgenda = (typeof FREQUENCIAS_DA_AGENDA)[number];

export const METODOS_DE_VERIFICACAO = ['DNS_TXT', 'ARQUIVO_WELL_KNOWN', 'CABECALHO_HTTP'] as const;
export type MetodoDeVerificacao = (typeof METODOS_DE_VERIFICACAO)[number];

export const ESTADOS_DA_VERIFICACAO = ['PENDENTE', 'VERIFICADO', 'FALHOU', 'EXPIRADO'] as const;
export type EstadoDaVerificacao = (typeof ESTADOS_DA_VERIFICACAO)[number];

export const PERFIS_DE_AVALIACAO = ['PASSIVO', 'PADRAO', 'COMPLETO', 'IA'] as const;
export type PerfilDeAvaliacao = (typeof PERFIS_DE_AVALIACAO)[number];

export const ESTADOS_DA_AVALIACAO = [
  'RASCUNHO',
  'AGUARDANDO_VERIFICACAO',
  'NA_FILA',
  'PREPARANDO',
  'EM_EXECUCAO',
  'ANALISANDO',
  'CONCLUIDA',
  'FALHOU',
  'CANCELADA',
] as const;
export type EstadoDaAvaliacao = (typeof ESTADOS_DA_AVALIACAO)[number];

export const ESTADOS_DA_ETAPA = ['PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA', 'FALHOU', 'IGNORADA'] as const;
export type EstadoDaEtapa = (typeof ESTADOS_DA_ETAPA)[number];

export const ESTADOS_DO_ACHADO = [
  'NOVO',
  'CONFIRMADO',
  'EM_CORRECAO',
  'REVALIDANDO',
  'CORRIGIDO',
  'REABERTO',
  'RISCO_ACEITO',
] as const;
export type EstadoDoAchado = (typeof ESTADOS_DO_ACHADO)[number];

export const DECISOES_DO_GUARDIAO = ['PERMITIDA', 'BLOQUEADA'] as const;
export type DecisaoDoGuardiao = (typeof DECISOES_DO_GUARDIAO)[number];

export const TIPOS_DE_ATOR = ['USUARIO', 'CHAVE_DE_API', 'SISTEMA'] as const;
export type TipoDeAtor = (typeof TIPOS_DE_ATOR)[number];

export const ESTADOS_DO_MEMBRO = ['ATIVO', 'CONVIDADO'] as const;
export type EstadoDoMembro = (typeof ESTADOS_DO_MEMBRO)[number];

export const EVENTOS_DE_WEBHOOK = [
  'avaliacao.concluida',
  'avaliacao.falhou',
  'achado.criado',
  'achado.corrigido',
] as const;
export type EventoDeWebhook = (typeof EVENTOS_DE_WEBHOOK)[number];

export const TIPOS_DE_CONSTATACAO = [
  'CABECALHO_CSP_AUSENTE',
  'CABECALHO_HSTS_AUSENTE',
  'CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE',
  'PROTECAO_CLICKJACKING_AUSENTE',
  'CABECALHO_REFERRER_POLICY_AUSENTE',
  'CABECALHO_PERMISSIONS_POLICY_AUSENTE',
  'TLS_VERSAO_OBSOLETA',
  'TLS_CERTIFICADO_EXPIRANDO',
  'TLS_CERTIFICADO_EXPIRADO',
  'TLS_CERTIFICADO_NAO_CONFIAVEL',
  'TLS_NOME_NAO_CONFERE',
  'HTTPS_AUSENTE',
  'COOKIE_SEM_SECURE',
  'COOKIE_SEM_HTTPONLY',
  'COOKIE_SEM_SAMESITE',
  'VERSAO_EXPOSTA_SERVER',
  'VERSAO_EXPOSTA_X_POWERED_BY',
  'VERSAO_EXPOSTA_OUTROS',
  'ARQUIVO_SENSIVEL_EXPOSTO',
  'LISTAGEM_DE_DIRETORIO',
  'CORS_PERMISSIVO',
  'METODO_HTTP_PERIGOSO',
  'REDIRECIONAMENTO_ABERTO',
  'ENTRADA_REFLETIDA_SEM_ESCAPE',
  'ERRO_DETALHADO_EXPOSTO',
  'SECURITY_TXT_AUSENTE',
  'PAGINA_SENSIVEL_SEM_AUTENTICACAO',
  'CONTROLE_DE_ACESSO_QUEBRADO',
  'INJECAO_SQL',
  'INJECAO_DE_TEMPLATE',
  'TRAVESSIA_DE_CAMINHO',
  'IA_INJECAO_DE_PROMPT',
  'IA_VAZAMENTO_DE_PROMPT_DE_SISTEMA',
  'IA_VAZAMENTO_DE_DADOS_SENSIVEIS',
  'IA_SAIDA_INSEGURA',
  'IA_ACAO_EXCESSIVA',
] as const;
export type TipoDeConstatacao = (typeof TIPOS_DE_CONSTATACAO)[number];

export const Constatacao = z.object({
  tipo: z.enum(TIPOS_DE_CONSTATACAO),
  titulo: z.string().min(1),
  severidade: z.enum(SEVERIDADES),
  local: z.string().min(1),
  descricao: z.string(),
  evidencia: z.object({
    requisicao: z.string(),
    resposta: z.string(),
    observacao: z.string(),
  }),
  correcaoSugerida: z.string(),
  conformidade: z.object({
    owasp: z.array(z.string()),
    lgpd: z.array(z.string()),
  }),
});
export type Constatacao = z.infer<typeof Constatacao>;

export const EscopoDaTarefa = z.object({
  hostsPermitidos: z.array(z.string()).min(1),
  dominiosBloqueados: z.array(z.string()),
  requisicoesPorSegundo: z.number().positive().max(50),
  tempoMaximoMs: z.number().int().positive(),
  metodosPermitidos: z.array(z.string()).min(1),
  caminhosExcluidos: z.array(z.string()),
  tetoDeRequisicoes: z.number().int().positive(),
  permitirCriacaoDeDados: z.boolean(),
});
export type EscopoDaTarefa = z.infer<typeof EscopoDaTarefa>;

export const RespostaDeErro = z.object({
  erro: z.object({
    codigo: z.string(),
    mensagem: z.string(),
    detalhes: z.unknown().optional(),
  }),
});
export type RespostaDeErro = z.infer<typeof RespostaDeErro>;

export const ConsultaPaginada = z.object({
  pagina: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
export type ConsultaPaginada = z.infer<typeof ConsultaPaginada>;

export const esquemaDePagina = <T extends z.ZodType>(item: T) =>
  z.object({
    itens: z.array(item),
    proximaPagina: z.string().nullable(),
  });

export const ParametroId = z.object({ id: z.uuid() });
export type ParametroId = z.infer<typeof ParametroId>;

/** Data e hora em ISO 8601 (com deslocamento). */
export const DataIso = z.iso.datetime({ offset: true });
