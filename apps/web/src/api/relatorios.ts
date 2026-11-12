import { RelatorioDto, RelatorioResumoDto } from "@bastion/contratos";
import { z } from "zod";
import { montarConsulta } from "./avaliacoes";
import { URL_DA_API, requisitar } from "./cliente";

const ListaDeRelatorios = z.object({ itens: z.array(RelatorioResumoDto) });

export const listarRelatorios = async (avaliacaoId?: string, sinal?: AbortSignal): Promise<RelatorioResumoDto[]> =>
  (await requisitar(`/v1/relatorios${montarConsulta({ avaliacaoId })}`, { esquema: ListaDeRelatorios, sinal })).itens;

export const obterRelatorio = (id: string, sinal?: AbortSignal): Promise<RelatorioDto> =>
  requisitar(`/v1/relatorios/${id}?formato=json`, { esquema: RelatorioDto, sinal });

export const enderecoDoRelatorio = (id: string, formato: "html" | "pdf"): string =>
  `${URL_DA_API}/v1/relatorios/${id}?formato=${formato}`;
