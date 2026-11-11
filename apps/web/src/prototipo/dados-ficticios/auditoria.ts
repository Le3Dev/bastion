import type { AtorDeAuditoria, RegistroDeAuditoria } from "../tipos";

const usuario = (nome: string): AtorDeAuditoria => ({ nome, tipo: "USUARIO" });
const sistema: AtorDeAuditoria = { nome: "Guardião de Escopo", tipo: "SISTEMA" };
const avaliador: AtorDeAuditoria = { nome: "Bastion (avaliação passiva)", tipo: "SISTEMA" };
const chave: AtorDeAuditoria = { nome: "Pipeline de CI (bst_k7Q2xA)", tipo: "CHAVE_DE_API" };

const r = (
  n: number,
  em: string,
  ator: AtorDeAuditoria,
  acao: string,
  alvo: string,
  detalhe?: string,
): RegistroDeAuditoria => ({ id: `aud-${n}`, em, ator, acao, alvo, ...(detalhe ? { detalhe } : {}) });

// Mais recentes primeiro.
export const auditoriaInicial: RegistroDeAuditoria[] = [
  r(20, "2026-11-10T18:00:05.000Z", chave, "avaliacao.solicitada", "ava-6", "Portal do Colaborador, perfil Passivo, origem CI."),
  r(19, "2026-11-09T17:45:00.000Z", usuario("Helena Prado"), "membro.convidado", "camila.ribeiro@organizacao-exemplo.com.br", "Papel: Leitor."),
  r(18, "2026-11-09T16:30:00.000Z", usuario("Helena Prado"), "sistema.cadastrado", "sis-4", "Assistente Virtual de Atendimento; verificação por DNS TXT pendente."),
  r(17, "2026-11-08T14:20:00.000Z", usuario("Diego Martins"), "achado.estado_alterado", "ach-9", "EM_CORRECAO para REVALIDANDO."),
  r(16, "2026-11-07T16:22:10.000Z", usuario("Rafael Costa"), "avaliacao.cancelada", "ava-5", "Parada manual durante a etapa de cabeçalhos."),
  r(15, "2026-11-07T16:21:30.000Z", sistema, "guardiao.requisicao_bloqueada", "https://api.pagamentos-exemplo.com.br/", "Motivo: domínio de produção declarado."),
  r(14, "2026-11-05T09:33:00.000Z", avaliador, "avaliacao.falhou", "ava-4", "Tempo esgotado ao conectar no host de homologação."),
  r(13, "2026-11-03T15:08:30.000Z", avaliador, "avaliacao.concluida", "ava-3", "Nota 61."),
  r(12, "2026-11-03T15:05:00.000Z", avaliador, "achado.reaberto", "ach-11", "X-Powered-By voltou a ser exposto."),
  r(11, "2026-11-03T15:01:40.000Z", sistema, "guardiao.requisicao_bloqueada", "https://cdn.terceiro-exemplo.net/rastreador.js", "Motivo: redirecionamento para fora do escopo."),
  r(10, "2026-11-02T13:10:00.000Z", usuario("Helena Prado"), "sistema.verificado", "sis-3", "Método: cabeçalho HTTP."),
  r(9, "2026-10-25T16:00:00.000Z", usuario("Rafael Costa"), "achado.risco_aceito", "ach-4", "Válido até 30/04/2027."),
  r(8, "2026-10-22T09:00:00.000Z", usuario("Helena Prado"), "chave_de_api.criada", "key-1", "Pipeline de CI."),
  r(7, "2026-10-20T14:06:00.000Z", avaliador, "avaliacao.concluida", "ava-2", "Nota 55."),
  r(6, "2026-10-20T14:00:00.000Z", usuario("Marina Alves"), "avaliacao.solicitada", "ava-2", "API de Pagamentos, perfil Passivo."),
  r(5, "2026-10-19T15:05:00.000Z", usuario("Marina Alves"), "sistema.verificado", "sis-2", "Método: arquivo em /.well-known/."),
  r(4, "2026-10-14T12:09:00.000Z", avaliador, "avaliacao.concluida", "ava-1", "Nota 62."),
  r(3, "2026-10-14T12:00:00.000Z", usuario("Helena Prado"), "avaliacao.solicitada", "ava-1", "Loja Exemplo, perfil Passivo."),
  r(2, "2026-10-13T11:20:00.000Z", usuario("Helena Prado"), "sistema.verificado", "sis-1", "Método: registro DNS TXT."),
  r(1, "2026-10-13T11:00:00.000Z", usuario("Helena Prado"), "sistema.cadastrado", "sis-1", "Loja Exemplo; produção declarada: www.loja-exemplo.com.br."),
];
