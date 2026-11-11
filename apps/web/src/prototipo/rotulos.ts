import type {
  EstadoDaAvaliacao,
  EstadoDaVerificacao,
  EstadoDoAchado,
  MetodoDeVerificacao,
  Papel,
  PerfilDeAvaliacao,
  Severidade,
  TipoDeSistema,
} from "./tipos";

export const rotuloDoEstadoDaAvaliacao = (e: EstadoDaAvaliacao): string =>
  ({
    RASCUNHO: "Rascunho",
    AGUARDANDO_VERIFICACAO: "Aguardando verificação",
    NA_FILA: "Na fila",
    PREPARANDO: "Preparando",
    EM_EXECUCAO: "Em execução",
    ANALISANDO: "Analisando",
    CONCLUIDA: "Concluída",
    FALHOU: "Falhou",
    CANCELADA: "Cancelada",
  })[e];

export const rotuloDoEstadoDoAchado = (e: EstadoDoAchado): string =>
  ({
    NOVO: "Novo",
    CONFIRMADO: "Confirmado",
    EM_CORRECAO: "Em correção",
    REVALIDANDO: "Revalidando",
    CORRIGIDO: "Corrigido",
    REABERTO: "Reaberto",
    RISCO_ACEITO: "Risco aceito",
  })[e];

export const rotuloDaSeveridade = (s: Severidade): string =>
  ({ CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" })[s];

export const rotuloDoPapel = (p: Papel): string =>
  ({
    DONO: "Dono",
    ADMIN: "Admin",
    ANALISTA: "Analista",
    DESENVOLVEDOR: "Desenvolvedor",
    LEITOR: "Leitor",
  })[p];

export const rotuloDoTipoDeSistema = (t: TipoDeSistema): string =>
  ({
    SITE: "Site",
    API: "API",
    SISTEMA_INTERNO: "Sistema interno",
    APP_COM_IA: "App com IA",
  })[t];

export const rotuloDoMetodoDeVerificacao = (m: MetodoDeVerificacao): string =>
  ({
    DNS_TXT: "Registro DNS TXT",
    ARQUIVO_WELL_KNOWN: "Arquivo em /.well-known/",
    CABECALHO_HTTP: "Cabeçalho HTTP",
  })[m];

export const rotuloDoEstadoDaVerificacao = (e: EstadoDaVerificacao): string =>
  ({ PENDENTE: "Pendente", VERIFICADO: "Verificado", FALHOU: "Falhou", EXPIRADO: "Expirado" })[e];

export const rotuloDoPerfil = (p: PerfilDeAvaliacao): string =>
  ({ PASSIVO: "Passivo", PADRAO: "Padrão", COMPLETO: "Completo" })[p];

export const ordemDasSeveridades: Severidade[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];

export const classeDaSeveridade = (s: Severidade): string =>
  ({ CRITICA: "tag-critica", ALTA: "tag-alta", MEDIA: "tag-media", BAIXA: "tag-baixa" })[s];

export const papeisDisponiveis: Papel[] = ["DONO", "ADMIN", "ANALISTA", "DESENVOLVEDOR", "LEITOR"];
export const tiposDeSistemaDisponiveis: TipoDeSistema[] = ["SITE", "API", "SISTEMA_INTERNO", "APP_COM_IA"];
export const metodosDeVerificacaoDisponiveis: MetodoDeVerificacao[] = [
  "DNS_TXT",
  "ARQUIVO_WELL_KNOWN",
  "CABECALHO_HTTP",
];
export const estadosDoAchadoDisponiveis: EstadoDoAchado[] = [
  "NOVO",
  "CONFIRMADO",
  "EM_CORRECAO",
  "REVALIDANDO",
  "CORRIGIDO",
  "REABERTO",
  "RISCO_ACEITO",
];
