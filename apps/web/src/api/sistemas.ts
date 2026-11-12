import {
  InstrucoesDeVerificacaoDto,
  RespostaDeCadastroDeSistema,
  RespostaDeVerificacao,
  SistemaDto,
  type CorpoDeCadastroDeSistema,
  type CorpoDeVerificacao,
} from "@bastion/contratos";
import { z } from "zod";
import { requisitar } from "./cliente";

const ListaDeSistemas = z.object({ itens: z.array(SistemaDto) });

export const listarSistemas = async (sinal?: AbortSignal): Promise<SistemaDto[]> =>
  (await requisitar("/v1/sistemas", { esquema: ListaDeSistemas, sinal })).itens;

export const obterSistema = (id: string, sinal?: AbortSignal): Promise<SistemaDto> =>
  requisitar(`/v1/sistemas/${id}`, { esquema: SistemaDto, sinal });

export const cadastrarSistema = (corpo: CorpoDeCadastroDeSistema): Promise<RespostaDeCadastroDeSistema> =>
  requisitar("/v1/sistemas", { metodo: "POST", corpo, esquema: RespostaDeCadastroDeSistema });

export const obterInstrucoesDeVerificacao = (id: string, sinal?: AbortSignal): Promise<InstrucoesDeVerificacaoDto> =>
  requisitar(`/v1/sistemas/${id}/verificacao`, { esquema: InstrucoesDeVerificacaoDto, sinal });

/** Pode levar até 20 s; a API responde 504 VERIFICACAO_DEMOROU se estourar. */
export const verificarPropriedade = (id: string, corpo: CorpoDeVerificacao = {}): Promise<RespostaDeVerificacao> =>
  requisitar(`/v1/sistemas/${id}/verificacao`, { metodo: "POST", corpo, esquema: RespostaDeVerificacao });
