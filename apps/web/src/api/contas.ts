import {
  ChaveDeApiDto,
  MembroDto,
  PlanoDto,
  RespostaDeConvite,
  RespostaDeNovaChave,
  RespostaDeNovoWebhook,
  RespostaDeSessao,
  WebhookDto,
  type CorpoDeAceiteDeConvite,
  type CorpoDeAlteracaoDePapel,
  type CorpoDeAlteracaoDeWebhook,
  type CorpoDeCadastroDeOrganizacao,
  type CorpoDeConvite,
  type CorpoDeEntrada,
  type CorpoDeNovaChave,
  type CorpoDeNovoWebhook,
} from "@bastion/contratos";
import { z } from "zod";
import { requisitar, requisitarSemCorpo } from "./cliente";

const ListaDeMembros = z.object({ itens: z.array(MembroDto) });
const ListaDeChaves = z.object({ itens: z.array(ChaveDeApiDto) });
const ListaDeWebhooks = z.object({ itens: z.array(WebhookDto) });

// Sessão
export const entrar = (corpo: CorpoDeEntrada): Promise<RespostaDeSessao> =>
  requisitar("/v1/sessao", { metodo: "POST", corpo, esquema: RespostaDeSessao });

export const sair = (): Promise<undefined> => requisitarSemCorpo("/v1/sessao", { metodo: "DELETE" });

export const obterSessao = (sinal?: AbortSignal): Promise<RespostaDeSessao> =>
  requisitar("/v1/sessao", { esquema: RespostaDeSessao, sinal });

export const cadastrarOrganizacao = (corpo: CorpoDeCadastroDeOrganizacao): Promise<RespostaDeSessao> =>
  requisitar("/v1/organizacoes", { metodo: "POST", corpo, esquema: RespostaDeSessao });

export const aceitarConvite = (corpo: CorpoDeAceiteDeConvite): Promise<RespostaDeSessao> =>
  requisitar("/v1/convites/aceitar", { metodo: "POST", corpo, esquema: RespostaDeSessao });

// Membros
export const listarMembros = async (sinal?: AbortSignal): Promise<MembroDto[]> =>
  (await requisitar("/v1/membros", { esquema: ListaDeMembros, sinal })).itens;

export const convidarMembro = (corpo: CorpoDeConvite): Promise<RespostaDeConvite> =>
  requisitar("/v1/membros", { metodo: "POST", corpo, esquema: RespostaDeConvite });

export const alterarPapelDoMembro = (id: string, corpo: CorpoDeAlteracaoDePapel): Promise<MembroDto> =>
  requisitar(`/v1/membros/${id}`, { metodo: "PATCH", corpo, esquema: MembroDto });

export const removerMembro = (id: string): Promise<undefined> =>
  requisitarSemCorpo(`/v1/membros/${id}`, { metodo: "DELETE" });

// Chaves de API
export const listarChavesDeApi = async (sinal?: AbortSignal): Promise<ChaveDeApiDto[]> =>
  (await requisitar("/v1/chaves-de-api", { esquema: ListaDeChaves, sinal })).itens;

export const criarChaveDeApi = (corpo: CorpoDeNovaChave): Promise<RespostaDeNovaChave> =>
  requisitar("/v1/chaves-de-api", { metodo: "POST", corpo, esquema: RespostaDeNovaChave });

export const revogarChaveDeApi = (id: string): Promise<undefined> =>
  requisitarSemCorpo(`/v1/chaves-de-api/${id}`, { metodo: "DELETE" });

// Webhooks
export const listarWebhooks = async (sinal?: AbortSignal): Promise<WebhookDto[]> =>
  (await requisitar("/v1/webhooks", { esquema: ListaDeWebhooks, sinal })).itens;

export const cadastrarWebhook = (corpo: CorpoDeNovoWebhook): Promise<RespostaDeNovoWebhook> =>
  requisitar("/v1/webhooks", { metodo: "POST", corpo, esquema: RespostaDeNovoWebhook });

export const alterarWebhook = (id: string, corpo: CorpoDeAlteracaoDeWebhook): Promise<WebhookDto> =>
  requisitar(`/v1/webhooks/${id}`, { metodo: "PATCH", corpo, esquema: WebhookDto });

export const removerWebhook = (id: string): Promise<undefined> =>
  requisitarSemCorpo(`/v1/webhooks/${id}`, { metodo: "DELETE" });

// Plano
export const obterPlano = (sinal?: AbortSignal): Promise<PlanoDto> =>
  requisitar("/v1/plano", { esquema: PlanoDto, sinal });
