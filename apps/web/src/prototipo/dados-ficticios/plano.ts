import type { PlanoDeCobranca } from "../tipos";

export const planoInicial: PlanoDeCobranca = {
  nome: "Profissional",
  limites: { sistemas: 10, avaliacoesPorMes: 60, membros: 10 },
  uso: { sistemas: 4, avaliacoesPorMes: 5, membros: 5 },
  faturas: [
    { id: "fat-3", competencia: "11/2026", valor: 1490, estado: "EM_ABERTO" },
    { id: "fat-2", competencia: "10/2026", valor: 1490, estado: "PAGA" },
    { id: "fat-1", competencia: "09/2026", valor: 1490, estado: "PAGA" },
  ],
};
