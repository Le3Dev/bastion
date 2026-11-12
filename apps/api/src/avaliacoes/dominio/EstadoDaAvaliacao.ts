export type EstadoDaAvaliacao =
  | 'RASCUNHO'
  | 'AGUARDANDO_VERIFICACAO'
  | 'NA_FILA'
  | 'PREPARANDO'
  | 'EM_EXECUCAO'
  | 'ANALISANDO'
  | 'CONCLUIDA'
  | 'FALHOU'
  | 'CANCELADA';

export const ESTADOS_DA_AVALIACAO: readonly EstadoDaAvaliacao[] = [
  'RASCUNHO',
  'AGUARDANDO_VERIFICACAO',
  'NA_FILA',
  'PREPARANDO',
  'EM_EXECUCAO',
  'ANALISANDO',
  'CONCLUIDA',
  'FALHOU',
  'CANCELADA',
];

export const TRANSICOES_DA_AVALIACAO: Readonly<Record<EstadoDaAvaliacao, readonly EstadoDaAvaliacao[]>> = {
  RASCUNHO: ['AGUARDANDO_VERIFICACAO', 'NA_FILA', 'CANCELADA'],
  AGUARDANDO_VERIFICACAO: ['NA_FILA', 'FALHOU', 'CANCELADA'],
  NA_FILA: ['PREPARANDO', 'CANCELADA'],
  PREPARANDO: ['EM_EXECUCAO', 'FALHOU', 'CANCELADA'],
  EM_EXECUCAO: ['ANALISANDO', 'FALHOU', 'CANCELADA'],
  ANALISANDO: ['CONCLUIDA', 'FALHOU', 'CANCELADA'],
  CONCLUIDA: [],
  FALHOU: [],
  CANCELADA: [],
};

export const podeTransicionar = (de: EstadoDaAvaliacao, para: EstadoDaAvaliacao): boolean =>
  TRANSICOES_DA_AVALIACAO[de].includes(para);

export const ehEstadoFinalDaAvaliacao = (estado: EstadoDaAvaliacao): boolean =>
  TRANSICOES_DA_AVALIACAO[estado].length === 0;
