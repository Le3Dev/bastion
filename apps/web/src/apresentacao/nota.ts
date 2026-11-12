export type FaixaDaNota = "boa" | "atencao" | "critica";

export const faixaDaNota = (nota: number): FaixaDaNota => (nota >= 80 ? "boa" : nota >= 50 ? "atencao" : "critica");
