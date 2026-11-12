import { RegistroDeAuditoriaDto, esquemaDePagina } from "@bastion/contratos";
import type { z } from "zod";
import { requisitar } from "./cliente";

const PaginaDeAuditoria = esquemaDePagina(RegistroDeAuditoriaDto);
export type PaginaDeAuditoria = z.infer<typeof PaginaDeAuditoria>;

export interface FiltrosDeAuditoria {
  ator?: string;
  acao?: string;
  busca?: string;
  /** Cursor devolvido em `proximaPagina`. */
  pagina?: string;
  limite?: number;
}

export const listarAuditoria = (filtros: FiltrosDeAuditoria = {}, sinal?: AbortSignal): Promise<PaginaDeAuditoria> => {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== "") parametros.set(chave, String(valor));
  }
  const consulta = parametros.toString();
  return requisitar(`/v1/auditoria${consulta ? `?${consulta}` : ""}`, { esquema: PaginaDeAuditoria, sinal });
};
