import type { ChaveDeApi, WebhookDeSaida } from "../tipos";

export const chavesDeApiIniciais: ChaveDeApi[] = [
  {
    id: "key-1",
    nome: "Pipeline de CI",
    prefixo: "bst_k7Q2xA",
    criadaEm: "2026-10-22T09:00:00.000Z",
    ultimoUsoEm: "2026-11-10T18:00:05.000Z",
    revogada: false,
  },
  {
    id: "key-2",
    nome: "Script de relatórios (descontinuado)",
    prefixo: "bst_m9Tz4R",
    criadaEm: "2026-09-10T13:00:00.000Z",
    ultimoUsoEm: "2026-10-01T08:00:00.000Z",
    revogada: true,
  },
];

export const webhooksIniciais: WebhookDeSaida[] = [
  {
    id: "wh-1",
    url: "https://hooks.organizacao-exemplo.com.br/bastion",
    eventos: ["avaliacao.concluida", "avaliacao.falhou", "achado.criado"],
    ativo: true,
    ultimoEnvioEm: "2026-11-05T09:33:05.000Z",
  },
];
