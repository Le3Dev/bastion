export type Severidade = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';

/** Da mais grave à mais leve. */
export const SEVERIDADES: readonly Severidade[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];

export const PESO_DA_SEVERIDADE: Readonly<Record<Severidade, number>> = {
  CRITICA: 25,
  ALTA: 10,
  MEDIA: 4,
  BAIXA: 1,
};
