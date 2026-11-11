// Contrato de domínio do protótipo (linguagem ubíqua do README, seção 4.2).

// ---- Contas e Acessos ----
export type Papel = "DONO" | "ADMIN" | "ANALISTA" | "DESENVOLVEDOR" | "LEITOR";
export type EstadoDoMembro = "ATIVO" | "CONVIDADO";

export interface Membro {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  estado: EstadoDoMembro;
  desde: string;
}

export interface Organizacao {
  id: string;
  nome: string;
  plano: string;
}

// ---- Sistemas e Autorização ----
export type TipoDeSistema = "SITE" | "API" | "SISTEMA_INTERNO" | "APP_COM_IA";
export type MetodoDeVerificacao = "DNS_TXT" | "ARQUIVO_WELL_KNOWN" | "CABECALHO_HTTP";
export type EstadoDaVerificacao = "PENDENTE" | "VERIFICADO" | "FALHOU" | "EXPIRADO";

export interface VerificacaoDePropriedade {
  metodo: MetodoDeVerificacao;
  token: string;
  estado: EstadoDaVerificacao;
  verificadoEm?: string;
  expiraEm?: string;
  mensagem?: string;
}

export interface Sistema {
  id: string;
  nome: string;
  tipo: TipoDeSistema;
  urlDeHomologacao: string;
  dominioDeProducao: string;
  verificacao: VerificacaoDePropriedade;
  criadoEm: string;
  ultimaNota: number | null;
}

// ---- Avaliações ----
export type PerfilDeAvaliacao = "PASSIVO" | "PADRAO" | "COMPLETO";

export type EstadoDaAvaliacao =
  | "RASCUNHO"
  | "AGUARDANDO_VERIFICACAO"
  | "NA_FILA"
  | "PREPARANDO"
  | "EM_EXECUCAO"
  | "ANALISANDO"
  | "CONCLUIDA"
  | "FALHOU"
  | "CANCELADA";

export type FrequenciaDaAgenda = "DIARIA" | "SEMANAL" | "MENSAL";

export interface Agenda {
  tipo: "UNICA" | "RECORRENTE";
  frequencia?: FrequenciaDaAgenda;
}

export type EstadoDaEtapa = "PENDENTE" | "EM_EXECUCAO" | "CONCLUIDA" | "FALHOU" | "IGNORADA";

export interface Etapa {
  id: string;
  nome: string;
  estado: EstadoDaEtapa;
  progresso: number;
}

export interface RequisicaoDoGuardiao {
  id: string;
  em: string;
  metodo: string;
  url: string;
  decisao: "PERMITIDA" | "BLOQUEADA";
  motivo: string;
  status?: number;
}

export type OrigemDaAvaliacao = "WEB" | "API" | "CI";

export interface Avaliacao {
  id: string;
  sistemaId: string;
  perfil: PerfilDeAvaliacao;
  agenda: Agenda;
  notaMinima: number;
  estado: EstadoDaAvaliacao;
  progresso: number;
  nota: number | null;
  etapas: Etapa[];
  requisicoesDoGuardiao: RequisicaoDoGuardiao[];
  achadoIds: string[];
  solicitadaEm: string;
  iniciadaEm?: string;
  concluidaEm?: string;
  solicitadaPor: string;
  origem: OrigemDaAvaliacao;
  motivoDaFalha?: string;
}

// ---- Achados ----
export type Severidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export type EstadoDoAchado =
  | "NOVO"
  | "CONFIRMADO"
  | "EM_CORRECAO"
  | "REVALIDANDO"
  | "CORRIGIDO"
  | "REABERTO"
  | "RISCO_ACEITO";

export interface Evidencia {
  requisicao: string;
  resposta: string;
  observacao: string;
}

export interface MapeamentoDeConformidade {
  owasp: string[];
  lgpd: string[];
}

export interface RiscoAceito {
  justificativa: string;
  responsavel: string;
  validoAte: string;
}

export interface HistoricoDoAchado {
  em: string;
  de: EstadoDoAchado | null;
  para: EstadoDoAchado;
  ator: string;
  comentario?: string;
}

export interface Achado {
  id: string;
  sistemaId: string;
  titulo: string;
  tipo: string;
  local: string;
  severidade: Severidade;
  estado: EstadoDoAchado;
  impressaoDigital: string;
  descricao: string;
  evidencia: Evidencia;
  correcaoSugerida: string;
  conformidade: MapeamentoDeConformidade;
  ocorrencias: number;
  avaliacaoIds: string[];
  primeiraVezEm: string;
  ultimaVezEm: string;
  historico: HistoricoDoAchado[];
  riscoAceito?: RiscoAceito;
}

// ---- Relatórios ----
export interface Relatorio {
  id: string;
  avaliacaoId: string;
  sistemaId: string;
  geradoEm: string;
  nota: number;
  resumo: string;
}

// ---- Auditoria ----
export interface AtorDeAuditoria {
  nome: string;
  tipo: "USUARIO" | "SISTEMA" | "CHAVE_DE_API";
}

export interface RegistroDeAuditoria {
  id: string;
  em: string;
  ator: AtorDeAuditoria;
  acao: string;
  alvo: string;
  detalhe?: string;
}

// ---- Integrações ----
export interface ChaveDeApi {
  id: string;
  nome: string;
  prefixo: string;
  criadaEm: string;
  ultimoUsoEm?: string;
  revogada: boolean;
}

export type EventoDeWebhook =
  | "avaliacao.concluida"
  | "avaliacao.falhou"
  | "achado.criado"
  | "achado.corrigido";

export interface WebhookDeSaida {
  id: string;
  url: string;
  eventos: EventoDeWebhook[];
  ativo: boolean;
  ultimoEnvioEm?: string;
}

// ---- Plano e cobrança ----
export interface Fatura {
  id: string;
  competencia: string;
  valor: number;
  estado: "PAGA" | "EM_ABERTO";
}

export interface PlanoDeCobranca {
  nome: string;
  limites: { sistemas: number; avaliacoesPorMes: number; membros: number };
  uso: { sistemas: number; avaliacoesPorMes: number; membros: number };
  faturas: Fatura[];
}

// ---- Snapshot ----
export interface EstadoDoPrototipo {
  organizacao: Organizacao;
  usuarioAtual: Membro | null;
  membros: Membro[];
  sistemas: Sistema[];
  avaliacoes: Avaliacao[];
  achados: Achado[];
  relatorios: Relatorio[];
  auditoria: RegistroDeAuditoria[];
  chavesDeApi: ChaveDeApi[];
  webhooks: WebhookDeSaida[];
  plano: PlanoDeCobranca;
}
