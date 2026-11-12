export type EstadoDoAchado =
  | 'NOVO'
  | 'CONFIRMADO'
  | 'EM_CORRECAO'
  | 'REVALIDANDO'
  | 'CORRIGIDO'
  | 'REABERTO'
  | 'RISCO_ACEITO';

export const ESTADOS_DO_ACHADO: readonly EstadoDoAchado[] = [
  'NOVO',
  'CONFIRMADO',
  'EM_CORRECAO',
  'REVALIDANDO',
  'CORRIGIDO',
  'REABERTO',
  'RISCO_ACEITO',
];

const TRANSICOES_DO_ACHADO: Readonly<Record<EstadoDoAchado, readonly EstadoDoAchado[]>> = {
  NOVO: ['CONFIRMADO', 'RISCO_ACEITO'],
  CONFIRMADO: ['EM_CORRECAO', 'RISCO_ACEITO'],
  EM_CORRECAO: ['REVALIDANDO'],
  REVALIDANDO: ['CORRIGIDO', 'REABERTO'],
  REABERTO: ['EM_CORRECAO', 'RISCO_ACEITO'],
  RISCO_ACEITO: ['CONFIRMADO'],
  CORRIGIDO: ['REABERTO'],
};

export const transicoesPossiveis = (estado: EstadoDoAchado): readonly EstadoDoAchado[] =>
  TRANSICOES_DO_ACHADO[estado];

export const podeTransicionarAchado = (de: EstadoDoAchado, para: EstadoDoAchado): boolean =>
  TRANSICOES_DO_ACHADO[de].includes(para);

/** Achado em aberto conta para a nota; CORRIGIDO e RISCO_ACEITO não contam. */
export const estaEmAberto = (estado: EstadoDoAchado): boolean =>
  estado !== 'CORRIGIDO' && estado !== 'RISCO_ACEITO';
