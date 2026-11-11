import type { EstadoDaAvaliacao, EstadoDoAchado } from "./tipos";

export const transicoesDaAvaliacao: Record<EstadoDaAvaliacao, EstadoDaAvaliacao[]> = {
  RASCUNHO: ["AGUARDANDO_VERIFICACAO", "NA_FILA", "CANCELADA"],
  AGUARDANDO_VERIFICACAO: ["NA_FILA", "FALHOU", "CANCELADA"],
  NA_FILA: ["PREPARANDO", "CANCELADA"],
  PREPARANDO: ["EM_EXECUCAO", "FALHOU", "CANCELADA"],
  EM_EXECUCAO: ["ANALISANDO", "FALHOU", "CANCELADA"],
  ANALISANDO: ["CONCLUIDA", "FALHOU", "CANCELADA"],
  CONCLUIDA: [],
  FALHOU: [],
  CANCELADA: [],
};

export const transicoesDoAchado: Record<EstadoDoAchado, EstadoDoAchado[]> = {
  NOVO: ["CONFIRMADO", "RISCO_ACEITO"],
  CONFIRMADO: ["EM_CORRECAO", "RISCO_ACEITO"],
  EM_CORRECAO: ["REVALIDANDO"],
  REVALIDANDO: ["CORRIGIDO", "REABERTO"],
  REABERTO: ["EM_CORRECAO", "RISCO_ACEITO"],
  RISCO_ACEITO: ["CONFIRMADO"],
  CORRIGIDO: ["REABERTO"],
};

export const podeTransicionarAvaliacao = (de: EstadoDaAvaliacao, para: EstadoDaAvaliacao): boolean =>
  transicoesDaAvaliacao[de].includes(para);

export const podeTransicionarAchado = (de: EstadoDoAchado, para: EstadoDoAchado): boolean =>
  transicoesDoAchado[de].includes(para);

export const transicoesPossiveisDoAchado = (estado: EstadoDoAchado): EstadoDoAchado[] =>
  transicoesDoAchado[estado];

export const ehEstadoFinalDaAvaliacao = (estado: EstadoDaAvaliacao): boolean =>
  transicoesDaAvaliacao[estado].length === 0;
