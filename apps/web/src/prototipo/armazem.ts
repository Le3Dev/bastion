import { achadosIniciais } from "./dados-ficticios/achados";
import { auditoriaInicial } from "./dados-ficticios/auditoria";
import { criarEtapas, avaliacoesIniciais } from "./dados-ficticios/avaliacoes";
import {
  AUTOR_DA_AVALIACAO,
  catalogoDoModuloPassivo,
  criarAchadoDoModelo,
  type ModeloDeAchado,
} from "./dados-ficticios/catalogo-de-achados";
import { membrosIniciais, organizacaoInicial } from "./dados-ficticios/contas";
import { chavesDeApiIniciais, webhooksIniciais } from "./dados-ficticios/integracoes";
import { planoInicial } from "./dados-ficticios/plano";
import { relatoriosIniciais } from "./dados-ficticios/relatorios";
import { sistemasIniciais } from "./dados-ficticios/sistemas";
import { ErroDeDominio } from "./erros";
import {
  ehEstadoFinalDaAvaliacao,
  podeTransicionarAchado,
  podeTransicionarAvaliacao,
} from "./maquinas-de-estado";
import { achadoEstaEmAberto, calcularNotaDeSeguranca } from "./nota";
import { rotuloDoEstadoDoAchado } from "./rotulos";
import type {
  Achado,
  Agenda,
  Avaliacao,
  ChaveDeApi,
  EstadoDaAvaliacao,
  EstadoDoAchado,
  EstadoDoPrototipo,
  Etapa,
  EventoDeWebhook,
  HistoricoDoAchado,
  MetodoDeVerificacao,
  Papel,
  PerfilDeAvaliacao,
  RegistroDeAuditoria,
  AtorDeAuditoria,
  RequisicaoDoGuardiao,
  RiscoAceito,
  Severidade,
  Sistema,
  TipoDeSistema,
  WebhookDeSaida,
  Membro,
  Relatorio,
} from "./tipos";

// ---------------------------------------------------------------------------
// Estado em memória (snapshot imutável)
// ---------------------------------------------------------------------------

const criarEstadoInicial = (): EstadoDoPrototipo => ({
  organizacao: organizacaoInicial,
  usuarioAtual: membrosIniciais.find((m) => m.papel === "DONO") ?? null,
  membros: membrosIniciais,
  sistemas: sistemasIniciais,
  avaliacoes: avaliacoesIniciais,
  achados: achadosIniciais,
  relatorios: relatoriosIniciais,
  auditoria: auditoriaInicial,
  chavesDeApi: chavesDeApiIniciais,
  webhooks: webhooksIniciais,
  plano: planoInicial,
});

const ESTADO_INICIAL: EstadoDoPrototipo = criarEstadoInicial();
let estado: EstadoDoPrototipo = ESTADO_INICIAL;
const ouvintes = new Set<() => void>();
let contadorDeIds = 100;

export const obterEstado = (): EstadoDoPrototipo => estado;
export const obterEstadoInicial = (): EstadoDoPrototipo => ESTADO_INICIAL;

export const assinar = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};

const atualizar = (fn: (atual: EstadoDoPrototipo) => EstadoDoPrototipo): void => {
  estado = fn(estado);
  ouvintes.forEach((ouvinte) => ouvinte());
};

// ---------------------------------------------------------------------------
// Utilitários (somente chamados dentro de ações)
// ---------------------------------------------------------------------------

const agoraIso = (): string => new Date().toISOString();
const proximoId = (prefixo: string): string => `${prefixo}-${++contadorDeIds}`;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_DOMINIO = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const textoAleatorio = (tamanho: number, alfabeto = ALFABETO): string =>
  Array.from({ length: tamanho }, () => alfabeto.charAt(Math.floor(Math.random() * alfabeto.length))).join("");

const nomeDoUsuario = (e: EstadoDoPrototipo): string => e.usuarioAtual?.nome ?? "Usuário";

const atorUsuario = (e: EstadoDoPrototipo): AtorDeAuditoria => ({ nome: nomeDoUsuario(e), tipo: "USUARIO" });

const comAuditoria = (
  e: EstadoDoPrototipo,
  acao: string,
  alvo: string,
  detalhe?: string,
  ator?: AtorDeAuditoria,
): RegistroDeAuditoria[] => [
  {
    id: proximoId("aud"),
    em: agoraIso(),
    ator: ator ?? atorUsuario(e),
    acao,
    alvo,
    ...(detalhe ? { detalhe } : {}),
  },
  ...e.auditoria,
];

const exigir = <T>(valor: T | undefined, mensagem: string): T => {
  if (valor === undefined) throw new ErroDeDominio(mensagem);
  return valor;
};

const validarEmail = (email: string): string => {
  const limpo = email.trim().toLowerCase();
  if (!REGEX_EMAIL.test(limpo)) throw new ErroDeDominio("Informe um e-mail válido.");
  return limpo;
};

const analisarUrlHttps = (texto: string): URL => {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    throw new ErroDeDominio("Informe uma URL válida, por exemplo https://homolog.seusite.com.br.");
  }
  if (url.protocol !== "https:") throw new ErroDeDominio("A URL precisa usar https://.");
  return url;
};

const normalizarDominio = (texto: string): string =>
  texto
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

const aplicarUso = (e: EstadoDoPrototipo, parcial: Partial<EstadoDoPrototipo["plano"]["uso"]>): EstadoDoPrototipo["plano"] => ({
  ...e.plano,
  uso: { ...e.plano.uso, ...parcial },
});

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------

export const sistemaPorId = (e: EstadoDoPrototipo, id: string): Sistema | undefined =>
  e.sistemas.find((s) => s.id === id);

export const avaliacaoPorId = (e: EstadoDoPrototipo, id: string): Avaliacao | undefined =>
  e.avaliacoes.find((a) => a.id === id);

export const achadoPorId = (e: EstadoDoPrototipo, id: string): Achado | undefined =>
  e.achados.find((a) => a.id === id);

export const relatorioPorId = (e: EstadoDoPrototipo, id: string): Relatorio | undefined =>
  e.relatorios.find((r) => r.id === id);

export const relatorioDaAvaliacao = (e: EstadoDoPrototipo, avaliacaoId: string): Relatorio | undefined =>
  e.relatorios.find((r) => r.avaliacaoId === avaliacaoId);

export const achadosDaAvaliacao = (e: EstadoDoPrototipo, avaliacaoId: string): Achado[] => {
  const avaliacao = avaliacaoPorId(e, avaliacaoId);
  if (!avaliacao) return [];
  return e.achados.filter((a) => avaliacao.achadoIds.includes(a.id));
};

export const achadosEmAberto = (e: EstadoDoPrototipo, sistemaId?: string): Achado[] =>
  e.achados.filter((a) => achadoEstaEmAberto(a) && (sistemaId === undefined || a.sistemaId === sistemaId));

export const contagemPorSeveridade = (achados: Achado[]): Record<Severidade, number> => {
  const contagem: Record<Severidade, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 };
  achados.forEach((a) => {
    contagem[a.severidade] += 1;
  });
  return contagem;
};

// ---------------------------------------------------------------------------
// Contas e Acessos
// ---------------------------------------------------------------------------

export const entrar = (email: string, senha: string): void => {
  const limpo = validarEmail(email);
  if (senha.trim().length === 0) throw new ErroDeDominio("Informe a senha.");
  atualizar((e) => {
    const membro = e.membros.find((m) => m.email === limpo) ?? e.membros.find((m) => m.papel === "DONO") ?? null;
    return { ...e, usuarioAtual: membro };
  });
};

export const sair = (): void => {
  atualizar((e) => ({ ...e, usuarioAtual: null }));
};

export const convidarMembro = (email: string, papel: Papel): Membro => {
  const limpo = validarEmail(email);
  if (papel === "DONO") throw new ErroDeDominio("A organização só pode ter um Dono.");
  if (estado.membros.some((m) => m.email === limpo)) {
    throw new ErroDeDominio("Já existe um membro ou convite com esse e-mail.");
  }
  const membro: Membro = {
    id: proximoId("mem"),
    nome: (limpo.split("@")[0] ?? limpo).replace(/[._]/g, " "),
    email: limpo,
    papel,
    estado: "CONVIDADO",
    desde: agoraIso(),
  };
  atualizar((e) => ({
    ...e,
    membros: [...e.membros, membro],
    plano: aplicarUso(e, { membros: e.membros.length + 1 }),
    auditoria: comAuditoria(e, "membro.convidado", limpo, `Papel: ${papel}.`),
  }));
  return membro;
};

export const alterarPapelDoMembro = (membroId: string, papel: Papel): void => {
  const membro = exigir(
    estado.membros.find((m) => m.id === membroId),
    "Membro não encontrado.",
  );
  if (membro.papel === "DONO") throw new ErroDeDominio("O papel do Dono não pode ser alterado.");
  if (papel === "DONO") throw new ErroDeDominio("A organização só pode ter um Dono.");
  atualizar((e) => ({
    ...e,
    membros: e.membros.map((m) => (m.id === membroId ? { ...m, papel } : m)),
    auditoria: comAuditoria(e, "membro.papel_alterado", membro.email, `${membro.papel} para ${papel}.`),
  }));
};

export const removerMembro = (membroId: string): void => {
  const membro = exigir(
    estado.membros.find((m) => m.id === membroId),
    "Membro não encontrado.",
  );
  if (membro.papel === "DONO") throw new ErroDeDominio("O Dono da organização não pode ser removido.");
  atualizar((e) => ({
    ...e,
    membros: e.membros.filter((m) => m.id !== membroId),
    plano: aplicarUso(e, { membros: e.membros.length - 1 }),
    auditoria: comAuditoria(e, "membro.removido", membro.email),
  }));
};

// ---------------------------------------------------------------------------
// Sistemas e Autorização
// ---------------------------------------------------------------------------

export interface DadosDoCadastroDeSistema {
  nome: string;
  tipo: TipoDeSistema;
  urlDeHomologacao: string;
  dominioDeProducao: string;
  metodoDeVerificacao: MetodoDeVerificacao;
}

export const cadastrarSistema = (dados: DadosDoCadastroDeSistema): Sistema => {
  const nome = dados.nome.trim();
  if (nome.length < 2) throw new ErroDeDominio("Informe o nome do sistema.");
  const url = analisarUrlHttps(dados.urlDeHomologacao);
  const producao = normalizarDominio(dados.dominioDeProducao);
  if (producao.length === 0) {
    throw new ErroDeDominio("Informe o domínio de produção: ele entra na lista de bloqueio do Guardião de Escopo.");
  }
  if (!REGEX_DOMINIO.test(producao)) throw new ErroDeDominio("O domínio de produção é inválido.");
  const host = url.hostname.toLowerCase();
  if (host === producao || host.endsWith(`.${producao}`)) {
    throw new ErroDeDominio(
      "O ambiente de homologação não pode ser o domínio de produção nem estar dentro dele. Use um host separado.",
    );
  }
  const sistema: Sistema = {
    id: proximoId("sis"),
    nome,
    tipo: dados.tipo,
    urlDeHomologacao: url.origin,
    dominioDeProducao: producao,
    verificacao: {
      metodo: dados.metodoDeVerificacao,
      token: `bastion-verificacao=${textoAleatorio(24, "0123456789abcdef")}`,
      estado: "PENDENTE",
    },
    criadoEm: agoraIso(),
    ultimaNota: null,
  };
  atualizar((e) => ({
    ...e,
    sistemas: [...e.sistemas, sistema],
    plano: aplicarUso(e, { sistemas: e.sistemas.length + 1 }),
    auditoria: comAuditoria(e, "sistema.cadastrado", sistema.id, `${nome}; produção declarada: ${producao}.`),
  }));
  return sistema;
};

export const verificarPropriedade = (sistemaId: string): Sistema => {
  const sistema = exigir(sistemaPorId(estado, sistemaId), "Sistema não encontrado.");
  const agora = new Date();
  const falhou = new URL(sistema.urlDeHomologacao).hostname.includes("falha");
  const verificacao = falhou
    ? {
        ...sistema.verificacao,
        estado: "FALHOU" as const,
        mensagem: "Não encontramos o token no local esperado. Confira a publicação e tente de novo.",
      }
    : {
        ...sistema.verificacao,
        estado: "VERIFICADO" as const,
        verificadoEm: agora.toISOString(),
        expiraEm: new Date(agora.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        mensagem: undefined,
      };
  const atualizado: Sistema = { ...sistema, verificacao };
  atualizar((e) => ({
    ...e,
    sistemas: e.sistemas.map((s) => (s.id === sistemaId ? atualizado : s)),
    auditoria: comAuditoria(
      e,
      falhou ? "sistema.verificacao_falhou" : "sistema.verificado",
      sistemaId,
      `Método: ${sistema.verificacao.metodo}.`,
    ),
  }));
  if (falhou) throw new ErroDeDominio(verificacao.mensagem ?? "A verificação de propriedade falhou.");
  return atualizado;
};

// ---------------------------------------------------------------------------
// Avaliações
// ---------------------------------------------------------------------------

export interface DadosDaSolicitacaoDeAvaliacao {
  sistemaId: string;
  perfil: PerfilDeAvaliacao;
  agenda: Agenda;
  notaMinima: number;
}

export const solicitarAvaliacao = (dados: DadosDaSolicitacaoDeAvaliacao): string => {
  const sistema = exigir(sistemaPorId(estado, dados.sistemaId), "Sistema não encontrado.");
  if (sistema.verificacao.estado !== "VERIFICADO") {
    throw new ErroDeDominio("O sistema ainda não teve a propriedade verificada.");
  }
  if (dados.perfil !== "PASSIVO") throw new ErroDeDominio("Perfil disponível depois do MVP.");
  if (!Number.isFinite(dados.notaMinima) || dados.notaMinima < 0 || dados.notaMinima > 100) {
    throw new ErroDeDominio("A nota mínima deve estar entre 0 e 100.");
  }
  if (dados.agenda.tipo === "RECORRENTE" && !dados.agenda.frequencia) {
    throw new ErroDeDominio("Escolha a frequência da avaliação recorrente.");
  }
  const id = proximoId("ava");
  let estadoDaAvaliacao: EstadoDaAvaliacao = "RASCUNHO";
  if (!podeTransicionarAvaliacao(estadoDaAvaliacao, "NA_FILA")) {
    throw new ErroDeDominio("Transição inválida para a avaliação.");
  }
  estadoDaAvaliacao = "NA_FILA";
  const avaliacao: Avaliacao = {
    id,
    sistemaId: sistema.id,
    perfil: dados.perfil,
    agenda: dados.agenda,
    notaMinima: Math.round(dados.notaMinima),
    estado: estadoDaAvaliacao,
    progresso: 0,
    nota: null,
    etapas: criarEtapas(id, "PENDENTE"),
    requisicoesDoGuardiao: [],
    achadoIds: [],
    solicitadaEm: agoraIso(),
    solicitadaPor: nomeDoUsuario(estado),
    origem: "WEB",
  };
  atualizar((e) => ({
    ...e,
    avaliacoes: [avaliacao, ...e.avaliacoes],
    plano: aplicarUso(e, { avaliacoesPorMes: e.plano.uso.avaliacoesPorMes + 1 }),
    auditoria: comAuditoria(e, "avaliacao.solicitada", id, `${sistema.nome}, perfil Passivo.`),
  }));
  return id;
};

const modelosDoSistema = (sistemaId: string): ModeloDeAchado[] => {
  const numero = Number.parseInt(sistemaId.replace(/\D/g, ""), 10) || 0;
  return catalogoDoModuloPassivo.filter((_, indice) => (indice + numero) % 3 !== 0);
};

const progressoGeral = (etapas: Etapa[]): number =>
  Math.round(etapas.reduce((soma, et) => soma + et.progresso, 0) / etapas.length);

const trocarEtapa = (etapas: Etapa[], indice: number, parcial: Partial<Etapa>): Etapa[] =>
  etapas.map((et, i) => (i === indice ? { ...et, ...parcial } : et));

const novaRequisicao = (
  avaliacao: Avaliacao,
  url: string,
  decisao: RequisicaoDoGuardiao["decisao"],
  motivo: string,
  status?: number,
  metodo = "GET",
): RequisicaoDoGuardiao => ({
  id: `${avaliacao.id}-r${avaliacao.requisicoesDoGuardiao.length + 1}`,
  em: agoraIso(),
  metodo,
  url,
  decisao,
  motivo,
  ...(status ? { status } : {}),
});

/** Registra os achados de uma etapa aplicando a deduplicação por impressão digital. */
const incorporarAchados = (
  e: EstadoDoPrototipo,
  avaliacao: Avaliacao,
  sistema: Sistema,
  etapaIndice: number,
): { achados: Achado[]; ids: string[]; novos: Achado[] } => {
  const agora = agoraIso();
  const host = new URL(sistema.urlDeHomologacao).host;
  let achados = e.achados;
  const ids: string[] = [];
  const novos: Achado[] = [];
  modelosDoSistema(sistema.id)
    .filter((m) => m.etapaIndice === etapaIndice)
    .forEach((modelo) => {
      const impressao = `${sistema.id}:${modelo.tipo}:${modelo.local}`;
      const existente = achados.find((a) => a.impressaoDigital === impressao);
      if (existente) {
        const reabre = existente.estado === "CORRIGIDO";
        const historico: HistoricoDoAchado[] = reabre
          ? [
              ...existente.historico,
              {
                em: agora,
                de: "CORRIGIDO",
                para: "REABERTO",
                ator: AUTOR_DA_AVALIACAO,
                comentario: `O problema voltou a aparecer na avaliação ${avaliacao.id}.`,
              },
            ]
          : existente.historico;
        const atualizado: Achado = {
          ...existente,
          ocorrencias: existente.avaliacaoIds.includes(avaliacao.id) ? existente.ocorrencias : existente.ocorrencias + 1,
          ultimaVezEm: agora,
          avaliacaoIds: existente.avaliacaoIds.includes(avaliacao.id)
            ? existente.avaliacaoIds
            : [...existente.avaliacaoIds, avaliacao.id],
          estado: reabre ? "REABERTO" : existente.estado,
          historico,
        };
        achados = achados.map((a) => (a.id === existente.id ? atualizado : a));
        ids.push(existente.id);
      } else {
        const criado = criarAchadoDoModelo({
          id: proximoId("ach"),
          sistemaId: sistema.id,
          host,
          modelo,
          estado: "NOVO",
          ocorrencias: 1,
          avaliacaoIds: [avaliacao.id],
          primeiraVezEm: agora,
          ultimaVezEm: agora,
          historico: [
            { em: agora, de: null, para: "NOVO", ator: AUTOR_DA_AVALIACAO, comentario: `Detectado pela avaliação ${avaliacao.id}.` },
          ],
        });
        achados = [...achados, criado];
        ids.push(criado.id);
        novos.push(criado);
      }
    });
  return { achados, ids, novos };
};

const resumoDoRelatorio = (achados: Achado[], nota: number, notaMinima: number): string => {
  const abertos = achados.filter(achadoEstaEmAberto);
  const c = contagemPorSeveridade(abertos);
  const base = `Avaliação passiva concluída: ${abertos.length} achados em aberto (${c.CRITICA} críticos, ${c.ALTA} altos, ${c.MEDIA} médios, ${c.BAIXA} baixos).`;
  return nota < notaMinima ? `${base} Nota ${nota}, abaixo da mínima de ${notaMinima}.` : `${base} Nota ${nota}.`;
};

/** Um tique da execução fictícia; a tela ao vivo chama a cada ~700 ms. */
export const avancarSimulacao = (avaliacaoId: string): void => {
  const avaliacao = exigir(avaliacaoPorId(estado, avaliacaoId), "Avaliação não encontrada.");
  if (ehEstadoFinalDaAvaliacao(avaliacao.estado)) return;
  const sistema = exigir(sistemaPorId(estado, avaliacao.sistemaId), "Sistema não encontrado.");
  const host = new URL(sistema.urlDeHomologacao).origin;
  const agora = agoraIso();

  const passar = (para: EstadoDaAvaliacao): EstadoDaAvaliacao => {
    if (!podeTransicionarAvaliacao(avaliacao.estado, para)) {
      throw new ErroDeDominio(`Transição inválida da avaliação: ${avaliacao.estado} para ${para}.`);
    }
    return para;
  };

  atualizar((e) => {
    let proxima: Avaliacao = { ...avaliacao };
    let achados = e.achados;
    let sistemas = e.sistemas;
    let relatorios = e.relatorios;
    let auditoria = e.auditoria;
    const requisicoes = [...avaliacao.requisicoesDoGuardiao];
    const adicionarRequisicao = (r: RequisicaoDoGuardiao): void => {
      requisicoes.push(r);
    };
    const gerar = (url: string, decisao: RequisicaoDoGuardiao["decisao"], motivo: string, status?: number, metodo?: string) =>
      novaRequisicao({ ...avaliacao, requisicoesDoGuardiao: requisicoes }, url, decisao, motivo, status, metodo);

    switch (avaliacao.estado) {
      case "NA_FILA": {
        proxima.estado = passar("PREPARANDO");
        proxima.iniciadaEm = agora;
        proxima.etapas = trocarEtapa(avaliacao.etapas, 0, { estado: "EM_EXECUCAO", progresso: 30 });
        adicionarRequisicao(gerar(`${host}/`, "PERMITIDA", "Host verificado da organização", 200, "HEAD"));
        auditoria = comAuditoria(e, "avaliacao.iniciada", avaliacao.id, undefined, { nome: "Bastion (fila)", tipo: "SISTEMA" });
        break;
      }
      case "PREPARANDO": {
        proxima.estado = passar("EM_EXECUCAO");
        proxima.etapas = trocarEtapa(trocarEtapa(avaliacao.etapas, 0, { estado: "CONCLUIDA", progresso: 100 }), 1, {
          estado: "EM_EXECUCAO",
          progresso: 0,
        });
        const producao = `https://${sistema.dominioDeProducao}/`;
        adicionarRequisicao(gerar(producao, "BLOQUEADA", "Domínio de produção declarado"));
        auditoria = comAuditoria(e, "guardiao.requisicao_bloqueada", producao, "Motivo: domínio de produção declarado.", {
          nome: "Guardião de Escopo",
          tipo: "SISTEMA",
        });
        break;
      }
      case "EM_EXECUCAO": {
        const indice = avaliacao.etapas.findIndex((et, i) => i >= 1 && i <= 4 && et.estado !== "CONCLUIDA");
        if (indice === -1) {
          proxima.estado = passar("ANALISANDO");
          proxima.etapas = trocarEtapa(avaliacao.etapas, 5, { estado: "EM_EXECUCAO", progresso: 0 });
          break;
        }
        const etapa = avaliacao.etapas[indice];
        if (!etapa) break;
        const novoProgresso = Math.min(100, etapa.progresso + 50);
        let etapas = trocarEtapa(avaliacao.etapas, indice, {
          estado: novoProgresso >= 100 ? "CONCLUIDA" : "EM_EXECUCAO",
          progresso: novoProgresso,
        });
        const caminhos = ["/", "/", "/", "/entrar", "/"];
        adicionarRequisicao(gerar(`${host}${caminhos[indice] ?? "/"}`, "PERMITIDA", "Host verificado da organização", 200));
        if (novoProgresso >= 100) {
          const resultado = incorporarAchados(e, avaliacao, sistema, indice);
          achados = resultado.achados;
          proxima.achadoIds = [...avaliacao.achadoIds, ...resultado.ids.filter((id) => !avaliacao.achadoIds.includes(id))];
          resultado.novos.forEach((a) => {
            auditoria = [
              {
                id: proximoId("aud"),
                em: agora,
                ator: { nome: AUTOR_DA_AVALIACAO, tipo: "SISTEMA" },
                acao: "achado.criado",
                alvo: a.id,
                detalhe: a.titulo,
              },
              ...auditoria,
            ];
          });
          if (indice === 2) {
            adicionarRequisicao(
              gerar("https://cdn.terceiro-exemplo.net/rastreador.js", "BLOQUEADA", "Redirecionamento para fora do escopo", 302),
            );
          }
          const proximoIndice = indice + 1;
          if (proximoIndice <= 4) {
            etapas = trocarEtapa(etapas, proximoIndice, { estado: "EM_EXECUCAO", progresso: 0 });
          }
        }
        proxima.etapas = etapas;
        break;
      }
      case "ANALISANDO": {
        const etapa = avaliacao.etapas[5];
        if (etapa && etapa.progresso < 50) {
          proxima.etapas = trocarEtapa(avaliacao.etapas, 5, { estado: "EM_EXECUCAO", progresso: 50 });
          break;
        }
        proxima.estado = passar("CONCLUIDA");
        proxima.etapas = trocarEtapa(avaliacao.etapas, 5, { estado: "CONCLUIDA", progresso: 100 });
        proxima.concluidaEm = agora;
        const doSistema = achados.filter((a) => a.sistemaId === sistema.id);
        const nota = calcularNotaDeSeguranca(doSistema);
        proxima.nota = nota;
        const idRelatorio = proximoId("rel");
        relatorios = [
          {
            id: idRelatorio,
            avaliacaoId: avaliacao.id,
            sistemaId: sistema.id,
            geradoEm: agora,
            nota,
            resumo: resumoDoRelatorio(doSistema, nota, avaliacao.notaMinima),
          },
          ...relatorios,
        ];
        sistemas = sistemas.map((s) => (s.id === sistema.id ? { ...s, ultimaNota: nota } : s));
        auditoria = comAuditoria(e, "avaliacao.concluida", avaliacao.id, `Nota ${nota}.`, {
          nome: AUTOR_DA_AVALIACAO,
          tipo: "SISTEMA",
        });
        break;
      }
      default:
        break;
    }

    proxima = {
      ...proxima,
      requisicoesDoGuardiao: requisicoes,
      progresso: proxima.estado === "CONCLUIDA" ? 100 : progressoGeral(proxima.etapas),
    };
    return {
      ...e,
      avaliacoes: e.avaliacoes.map((a) => (a.id === avaliacaoId ? proxima : a)),
      achados,
      sistemas,
      relatorios,
      auditoria,
    };
  });
};

export const pararAvaliacao = (avaliacaoId: string): void => {
  const avaliacao = exigir(avaliacaoPorId(estado, avaliacaoId), "Avaliação não encontrada.");
  if (ehEstadoFinalDaAvaliacao(avaliacao.estado)) {
    throw new ErroDeDominio("A avaliação já foi finalizada e não pode ser parada.");
  }
  if (!podeTransicionarAvaliacao(avaliacao.estado, "CANCELADA")) {
    throw new ErroDeDominio("Transição inválida para a avaliação.");
  }
  atualizar((e) => ({
    ...e,
    avaliacoes: e.avaliacoes.map((a) =>
      a.id === avaliacaoId
        ? {
            ...a,
            estado: "CANCELADA" as const,
            concluidaEm: agoraIso(),
            etapas: a.etapas.map((et): Etapa =>
              et.estado === "CONCLUIDA" ? et : { ...et, estado: "IGNORADA" },
            ),
          }
        : a,
    ),
    auditoria: comAuditoria(e, "avaliacao.cancelada", avaliacaoId, "Parada manual."),
  }));
};

// ---------------------------------------------------------------------------
// Achados
// ---------------------------------------------------------------------------

export interface OpcoesDaMudancaDeEstado {
  comentario?: string;
  riscoAceito?: RiscoAceito;
}

export const mudarEstadoDoAchado = (
  achadoId: string,
  para: EstadoDoAchado,
  opcoes: OpcoesDaMudancaDeEstado = {},
): Achado => {
  const achado = exigir(achadoPorId(estado, achadoId), "Achado não encontrado.");
  if (!podeTransicionarAchado(achado.estado, para)) {
    throw new ErroDeDominio(
      `Transição inválida: de "${rotuloDoEstadoDoAchado(achado.estado)}" para "${rotuloDoEstadoDoAchado(para)}".`,
    );
  }
  let riscoAceito: RiscoAceito | undefined;
  if (para === "RISCO_ACEITO") {
    const risco = opcoes.riscoAceito;
    if (!risco || risco.justificativa.trim().length === 0) {
      throw new ErroDeDominio("Aceitar o risco exige uma justificativa.");
    }
    if (risco.responsavel.trim().length === 0) throw new ErroDeDominio("Aceitar o risco exige um responsável.");
    const validade = new Date(risco.validoAte).getTime();
    if (Number.isNaN(validade) || validade <= Date.now()) {
      throw new ErroDeDominio("A validade do risco aceito deve ser uma data futura.");
    }
    riscoAceito = {
      justificativa: risco.justificativa.trim(),
      responsavel: risco.responsavel.trim(),
      validoAte: new Date(validade).toISOString(),
    };
  }
  const comentario = opcoes.comentario?.trim();
  const registro: HistoricoDoAchado = {
    em: agoraIso(),
    de: achado.estado,
    para,
    ator: nomeDoUsuario(estado),
    ...(comentario ? { comentario } : {}),
  };
  const { riscoAceito: _anterior, ...semRisco } = achado;
  void _anterior;
  const atualizado: Achado = {
    ...semRisco,
    estado: para,
    historico: [...achado.historico, registro],
    ...(riscoAceito ? { riscoAceito } : {}),
  };
  atualizar((e) => ({
    ...e,
    achados: e.achados.map((a) => (a.id === achadoId ? atualizado : a)),
    auditoria: comAuditoria(
      e,
      para === "RISCO_ACEITO" ? "achado.risco_aceito" : "achado.estado_alterado",
      achadoId,
      `${achado.estado} para ${para}.`,
    ),
  }));
  return atualizado;
};

export const revalidarAchado = (achadoId: string): Achado =>
  mudarEstadoDoAchado(achadoId, "REVALIDANDO", { comentario: "Revalidação solicitada." });

export const concluirRevalidacao = (achadoId: string): Achado =>
  mudarEstadoDoAchado(achadoId, "CORRIGIDO", { comentario: "Correção confirmada na revalidação." });

// ---------------------------------------------------------------------------
// Integrações
// ---------------------------------------------------------------------------

export const criarChaveDeApi = (nome: string): { chave: ChaveDeApi; segredoCompleto: string } => {
  const limpo = nome.trim();
  if (limpo.length < 2) throw new ErroDeDominio("Informe um nome para a chave de API.");
  const segredoCompleto = `bst_${textoAleatorio(40)}`;
  const chave: ChaveDeApi = {
    id: proximoId("key"),
    nome: limpo,
    prefixo: segredoCompleto.slice(0, 10),
    criadaEm: agoraIso(),
    revogada: false,
  };
  atualizar((e) => ({
    ...e,
    chavesDeApi: [chave, ...e.chavesDeApi],
    auditoria: comAuditoria(e, "chave_de_api.criada", chave.id, limpo),
  }));
  return { chave, segredoCompleto };
};

export const revogarChaveDeApi = (id: string): void => {
  const chave = exigir(
    estado.chavesDeApi.find((c) => c.id === id),
    "Chave de API não encontrada.",
  );
  if (chave.revogada) throw new ErroDeDominio("A chave de API já foi revogada.");
  atualizar((e) => ({
    ...e,
    chavesDeApi: e.chavesDeApi.map((c) => (c.id === id ? { ...c, revogada: true } : c)),
    auditoria: comAuditoria(e, "chave_de_api.revogada", id, chave.nome),
  }));
};

export const cadastrarWebhook = (url: string, eventos: EventoDeWebhook[]): WebhookDeSaida => {
  const analisada = analisarUrlHttps(url);
  if (eventos.length === 0) throw new ErroDeDominio("Escolha ao menos um evento.");
  const webhook: WebhookDeSaida = {
    id: proximoId("wh"),
    url: analisada.toString(),
    eventos: [...eventos],
    ativo: true,
  };
  atualizar((e) => ({
    ...e,
    webhooks: [...e.webhooks, webhook],
    auditoria: comAuditoria(e, "webhook.cadastrado", webhook.id, webhook.url),
  }));
  return webhook;
};

export const alternarWebhook = (id: string): void => {
  const webhook = exigir(
    estado.webhooks.find((w) => w.id === id),
    "Webhook não encontrado.",
  );
  atualizar((e) => ({
    ...e,
    webhooks: e.webhooks.map((w) => (w.id === id ? { ...w, ativo: !w.ativo } : w)),
    auditoria: comAuditoria(e, webhook.ativo ? "webhook.desativado" : "webhook.ativado", id, webhook.url),
  }));
};

export const removerWebhook = (id: string): void => {
  const webhook = exigir(
    estado.webhooks.find((w) => w.id === id),
    "Webhook não encontrado.",
  );
  atualizar((e) => ({
    ...e,
    webhooks: e.webhooks.filter((w) => w.id !== id),
    auditoria: comAuditoria(e, "webhook.removido", id, webhook.url),
  }));
};
