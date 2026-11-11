import type { Relatorio } from "../tipos";

export const relatoriosIniciais: Relatorio[] = [
  {
    id: "rel-3",
    avaliacaoId: "ava-3",
    sistemaId: "sis-1",
    geradoEm: "2026-11-03T15:08:30.000Z",
    nota: 61,
    resumo:
      "Segunda avaliação passiva da Loja Exemplo: 9 achados em aberto, nenhum crítico e 2 de severidade alta. O cabeçalho X-Powered-By voltou a aparecer e o achado foi reaberto.",
  },
  {
    id: "rel-2",
    avaliacaoId: "ava-2",
    sistemaId: "sis-2",
    geradoEm: "2026-10-20T14:06:30.000Z",
    nota: 55,
    resumo:
      "Avaliação passiva da API de Pagamentos: 3 achados em aberto, entre eles TLS 1.0 e 1.1 habilitados (crítico) e certificado perto do vencimento. Nota abaixo da mínima de 80.",
  },
  {
    id: "rel-1",
    avaliacaoId: "ava-1",
    sistemaId: "sis-1",
    geradoEm: "2026-10-14T12:09:30.000Z",
    nota: 62,
    resumo:
      "Primeira avaliação passiva da Loja Exemplo: 8 achados em aberto, principalmente cabeçalhos de segurança ausentes e cookie de sessão sem Secure.",
  },
];
