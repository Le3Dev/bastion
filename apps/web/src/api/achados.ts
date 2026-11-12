import {
  AchadoDto,
  AchadoResumoDto,
  RespostaDeMudancaDeEstado,
  RespostaDeRevalidacao,
  esquemaDePagina,
  type CorpoDeMudancaDeEstado,
  type EstadoDoAchado,
  type Severidade,
} from "@bastion/contratos";
import type { z } from "zod";
import { montarConsulta } from "./avaliacoes";
import { requisitar } from "./cliente";

const PaginaDeAchados = esquemaDePagina(AchadoResumoDto);
export type PaginaDeAchados = z.infer<typeof PaginaDeAchados>;

export interface FiltrosDeAchados {
  severidades?: Severidade[];
  estado?: EstadoDoAchado;
  sistemaId?: string;
  busca?: string;
  incluirFechados?: boolean;
  pagina?: string;
  limite?: number;
}

export const listarAchados = (filtros: FiltrosDeAchados = {}, sinal?: AbortSignal): Promise<PaginaDeAchados> =>
  requisitar(
    `/v1/achados${montarConsulta({
      severidade: filtros.severidades && filtros.severidades.length > 0 ? filtros.severidades.join(",") : undefined,
      estado: filtros.estado,
      sistemaId: filtros.sistemaId,
      busca: filtros.busca?.trim(),
      incluirFechados: filtros.incluirFechados ? "true" : undefined,
      pagina: filtros.pagina,
      limite: filtros.limite,
    })}`,
    { esquema: PaginaDeAchados, sinal },
  );

export const obterAchado = (id: string, sinal?: AbortSignal): Promise<AchadoDto> =>
  requisitar(`/v1/achados/${id}`, { esquema: AchadoDto, sinal });

export const mudarEstadoDoAchado = (id: string, corpo: CorpoDeMudancaDeEstado): Promise<RespostaDeMudancaDeEstado> =>
  requisitar(`/v1/achados/${id}`, { metodo: "PATCH", corpo, esquema: RespostaDeMudancaDeEstado });

export const revalidarAchado = (id: string): Promise<RespostaDeRevalidacao> =>
  requisitar(`/v1/achados/${id}/revalidar`, { metodo: "POST", esquema: RespostaDeRevalidacao });
