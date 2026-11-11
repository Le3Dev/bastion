import type { Achado } from "./tipos";

export type FaixaDaNota = "boa" | "atencao" | "critica";

const PESOS = { CRITICA: 25, ALTA: 10, MEDIA: 4, BAIXA: 1 } as const;

export const achadoEstaEmAberto = (a: Achado): boolean =>
  a.estado !== "CORRIGIDO" && a.estado !== "RISCO_ACEITO";

export const calcularNotaDeSeguranca = (achados: Achado[]): number => {
  const penalidade = achados
    .filter(achadoEstaEmAberto)
    .reduce((soma, a) => soma + PESOS[a.severidade], 0);
  return Math.max(0, 100 - penalidade);
};

export const faixaDaNota = (nota: number): FaixaDaNota =>
  nota >= 80 ? "boa" : nota >= 50 ? "atencao" : "critica";
