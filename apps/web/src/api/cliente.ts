import { RespostaDeErro } from "@bastion/contratos";
import type { z } from "zod";

export const URL_DA_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

const MENSAGEM_DE_REDE = "Não foi possível falar com a API. Confira se ela está rodando na porta 3333.";

export class ErroDaApi extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroDaApi";
    this.status = status;
    this.codigo = codigo;
  }
}

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface OpcoesBase {
  metodo?: MetodoHttp;
  corpo?: unknown;
  sinal?: AbortSignal;
}

interface OpcoesComEsquema<T> extends OpcoesBase {
  esquema: z.ZodType<T>;
}

/** Ignora cancelamentos propositais (AbortController) nas telas. */
export const foiCancelada = (erro: unknown): boolean => erro instanceof DOMException && erro.name === "AbortError";

export const mensagemDoErro = (erro: unknown): string =>
  erro instanceof Error ? erro.message : "Ocorreu um erro inesperado. Tente novamente.";

const enviar = async (caminho: string, opcoes: OpcoesBase): Promise<Response> => {
  const temCorpo = opcoes.corpo !== undefined;
  try {
    return await fetch(`${URL_DA_API}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      credentials: "include",
      headers: temCorpo ? { "Content-Type": "application/json" } : undefined,
      body: temCorpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: opcoes.sinal,
    });
  } catch (erro) {
    if (foiCancelada(erro)) throw erro;
    throw new ErroDaApi(0, "API_INDISPONIVEL", MENSAGEM_DE_REDE);
  }
};

const lerJson = async (resposta: Response): Promise<unknown> => {
  try {
    return await resposta.json();
  } catch {
    return undefined;
  }
};

const lancarSeFalhou = async (resposta: Response): Promise<void> => {
  if (resposta.ok) return;
  const json = await lerJson(resposta);
  const erro = RespostaDeErro.safeParse(json);
  if (erro.success) {
    throw new ErroDaApi(resposta.status, erro.data.erro.codigo, erro.data.erro.mensagem);
  }
  throw new ErroDaApi(resposta.status, "ERRO_DESCONHECIDO", `A API respondeu com o status ${resposta.status}.`);
};

/** Chamada com corpo de resposta validado por um esquema Zod de `@bastion/contratos`. */
export const requisitar = async <T>(caminho: string, opcoes: OpcoesComEsquema<T>): Promise<T> => {
  const resposta = await enviar(caminho, opcoes);
  await lancarSeFalhou(resposta);
  const json = await lerJson(resposta);
  const validado = opcoes.esquema.safeParse(json);
  if (!validado.success) {
    throw new ErroDaApi(resposta.status, "RESPOSTA_INVALIDA", "A API devolveu uma resposta em formato inesperado.");
  }
  return validado.data;
};

/** Chamada cuja resposta esperada é 204 (sem corpo). */
export const requisitarSemCorpo = async (caminho: string, opcoes: OpcoesBase = {}): Promise<undefined> => {
  const resposta = await enviar(caminho, opcoes);
  await lancarSeFalhou(resposta);
  return undefined;
};
