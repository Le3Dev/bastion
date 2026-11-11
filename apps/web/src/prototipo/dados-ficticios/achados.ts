import type { Achado, EstadoDoAchado, HistoricoDoAchado } from "../tipos";
import {
  AUTOR_DA_AVALIACAO,
  catalogoDoModuloPassivo,
  criarAchadoDoModelo,
  type ModeloDeAchado,
} from "./catalogo-de-achados";

const modelo = (chave: string): ModeloDeAchado => {
  const encontrado = catalogoDoModuloPassivo.find((m) => m.chave === chave);
  if (!encontrado) throw new Error(`Modelo de achado inexistente: ${chave}`);
  return encontrado;
};

const h = (
  em: string,
  de: EstadoDoAchado | null,
  para: EstadoDoAchado,
  ator: string,
  comentario?: string,
): HistoricoDoAchado => ({ em, de, para, ator, ...(comentario ? { comentario } : {}) });

const HOST_LOJA = "homolog.loja-exemplo.com.br";
const HOST_API = "hml-api.pagamentos-exemplo.com.br";

const A1 = "2026-10-14T12:05:00.000Z";
const A3 = "2026-11-03T15:05:00.000Z";

const nascimentoNaAva1 = (): HistoricoDoAchado =>
  h(A1, null, "NOVO", AUTOR_DA_AVALIACAO, "Detectado pela avaliação ava-1.");

const nascimentoNaAva3 = (): HistoricoDoAchado =>
  h(A3, null, "NOVO", AUTOR_DA_AVALIACAO, "Detectado pela avaliação ava-3.");

const loja = (
  id: string,
  chave: string,
  estado: EstadoDoAchado,
  avaliacaoIds: string[],
  historico: HistoricoDoAchado[],
  riscoAceito?: Achado["riscoAceito"],
): Achado =>
  criarAchadoDoModelo({
    id,
    sistemaId: "sis-1",
    host: HOST_LOJA,
    modelo: modelo(chave),
    estado,
    ocorrencias: avaliacaoIds.length,
    avaliacaoIds,
    primeiraVezEm: avaliacaoIds[0] === "ava-1" ? A1 : A3,
    ultimaVezEm: avaliacaoIds.includes("ava-3") ? A3 : A1,
    historico,
    riscoAceito,
  });

const api = (id: string, chave: string, estado: EstadoDoAchado, historico: HistoricoDoAchado[]): Achado =>
  criarAchadoDoModelo({
    id,
    sistemaId: "sis-2",
    host: HOST_API,
    modelo: modelo(chave),
    estado,
    ocorrencias: 1,
    avaliacaoIds: ["ava-2"],
    primeiraVezEm: "2026-10-20T14:05:00.000Z",
    ultimaVezEm: "2026-10-20T14:05:00.000Z",
    historico,
  });

const nascimentoNaAva2 = (): HistoricoDoAchado =>
  h("2026-10-20T14:05:00.000Z", null, "NOVO", AUTOR_DA_AVALIACAO, "Detectado pela avaliação ava-2.");

export const achadosIniciais: Achado[] = [
  loja("ach-1", "csp", "CONFIRMADO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:10:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves", "Confirmado na revisão semanal."),
  ]),
  loja("ach-2", "hsts", "EM_CORRECAO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:12:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
    h("2026-10-16T13:40:00.000Z", "CONFIRMADO", "EM_CORRECAO", "Diego Martins", "Ajuste no nginx previsto para a próxima sprint."),
  ]),
  loja("ach-3", "xcto", "NOVO", ["ava-3"], [nascimentoNaAva3()]),
  loja("ach-4", "clickjacking", "RISCO_ACEITO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:15:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
    h(
      "2026-10-25T16:00:00.000Z",
      "CONFIRMADO",
      "RISCO_ACEITO",
      "Rafael Costa",
      "A loja é embutida em um parceiro de marketplace; o enquadramento é intencional até a migração do parceiro.",
    ),
  ], {
    justificativa:
      "A loja é embutida em um parceiro de marketplace por contrato. O bloqueio de enquadramento quebraria o canal até a migração do parceiro para um fluxo de redirecionamento.",
    responsavel: "Rafael Costa",
    validoAte: "2027-04-30T23:59:59.000Z",
  }),
  loja("ach-5", "referrer", "CORRIGIDO", ["ava-1"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:18:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
    h("2026-10-17T11:00:00.000Z", "CONFIRMADO", "EM_CORRECAO", "Diego Martins"),
    h("2026-10-21T10:30:00.000Z", "EM_CORRECAO", "REVALIDANDO", "Diego Martins", "Cabeçalho adicionado em homologação."),
    h("2026-10-21T10:45:00.000Z", "REVALIDANDO", "CORRIGIDO", "Marina Alves", "Cabeçalho presente na revalidação."),
  ]),
  loja("ach-6", "permissions", "NOVO", ["ava-3"], [nascimentoNaAva3()]),
  loja("ach-7", "cookie-secure", "CONFIRMADO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:20:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves", "Prioridade alta: cookie de sessão."),
  ]),
  loja("ach-8", "cookie-httponly", "NOVO", ["ava-3"], [nascimentoNaAva3()]),
  loja("ach-9", "cookie-samesite", "REVALIDANDO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:22:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
    h("2026-10-18T15:00:00.000Z", "CONFIRMADO", "EM_CORRECAO", "Diego Martins"),
    h("2026-11-08T14:20:00.000Z", "EM_CORRECAO", "REVALIDANDO", "Diego Martins", "SameSite=Lax aplicado; aguardando nova avaliação."),
  ]),
  loja("ach-10", "server-versao", "CONFIRMADO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:25:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
  ]),
  loja("ach-11", "x-powered-by", "REABERTO", ["ava-1", "ava-3"], [
    nascimentoNaAva1(),
    h("2026-10-15T09:27:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
    h("2026-10-19T10:00:00.000Z", "CONFIRMADO", "EM_CORRECAO", "Diego Martins"),
    h("2026-10-22T17:00:00.000Z", "EM_CORRECAO", "REVALIDANDO", "Diego Martins"),
    h("2026-10-22T17:10:00.000Z", "REVALIDANDO", "CORRIGIDO", "Marina Alves"),
    h("2026-11-03T15:05:00.000Z", "CORRIGIDO", "REABERTO", AUTOR_DA_AVALIACAO, "O cabeçalho voltou a aparecer na avaliação ava-3."),
  ]),
  api("ach-12", "tls-legado", "CONFIRMADO", [
    nascimentoNaAva2(),
    h("2026-10-21T08:30:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves", "Bloqueia a conformidade com o requisito de TLS mínimo."),
  ]),
  api("ach-13", "cert-expirando", "NOVO", [nascimentoNaAva2()]),
  api("ach-14", "hsts", "CONFIRMADO", [
    nascimentoNaAva2(),
    h("2026-10-21T08:35:00.000Z", "NOVO", "CONFIRMADO", "Marina Alves"),
  ]),
];
