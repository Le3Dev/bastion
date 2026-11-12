import {
  AchadoResumoDto,
  AvaliacaoDto,
  RequisicaoDoGuardiaoDto,
  RespostaDeParada,
  RespostaDeSolicitacao,
  esquemaDePagina,
  type CorpoDeSolicitacaoDeAvaliacao,
  type EstadoDaAvaliacao,
  type Severidade,
} from "@bastion/contratos";
import { z } from "zod";
import { requisitar } from "./cliente";

const PaginaDeAvaliacoes = esquemaDePagina(AvaliacaoDto);
export type PaginaDeAvaliacoes = z.infer<typeof PaginaDeAvaliacoes>;
const PaginaDeAchadosResumo = esquemaDePagina(AchadoResumoDto);
const ListaDeRequisicoes = z.object({ itens: z.array(RequisicaoDoGuardiaoDto) });

export interface FiltrosDeAvaliacoes {
  sistemaId?: string;
  estado?: EstadoDaAvaliacao;
  pagina?: string;
  limite?: number;
}

const montarConsulta = (parametros: Record<string, string | number | undefined>): string => {
  const consulta = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== "") consulta.set(chave, String(valor));
  }
  const texto = consulta.toString();
  return texto ? `?${texto}` : "";
};

export const listarAvaliacoes = (filtros: FiltrosDeAvaliacoes = {}, sinal?: AbortSignal): Promise<PaginaDeAvaliacoes> =>
  requisitar(`/v1/avaliacoes${montarConsulta({ ...filtros })}`, { esquema: PaginaDeAvaliacoes, sinal });

export const solicitarAvaliacao = (corpo: CorpoDeSolicitacaoDeAvaliacao): Promise<RespostaDeSolicitacao> =>
  requisitar("/v1/avaliacoes", { metodo: "POST", corpo, esquema: RespostaDeSolicitacao });

export const obterAvaliacao = (id: string, sinal?: AbortSignal): Promise<AvaliacaoDto> =>
  requisitar(`/v1/avaliacoes/${id}`, { esquema: AvaliacaoDto, sinal });

export const listarRequisicoesDaAvaliacao = async (id: string, sinal?: AbortSignal): Promise<RequisicaoDoGuardiaoDto[]> =>
  (await requisitar(`/v1/avaliacoes/${id}/requisicoes`, { esquema: ListaDeRequisicoes, sinal })).itens;

export const pararAvaliacao = (id: string): Promise<RespostaDeParada> =>
  requisitar(`/v1/avaliacoes/${id}/parar`, { metodo: "POST", esquema: RespostaDeParada });

export const listarAchadosDaAvaliacao = (
  id: string,
  filtros: { severidade?: Severidade; pagina?: string; limite?: number } = {},
  sinal?: AbortSignal,
): Promise<z.infer<typeof PaginaDeAchadosResumo>> =>
  requisitar(`/v1/avaliacoes/${id}/achados${montarConsulta({ ...filtros })}`, { esquema: PaginaDeAchadosResumo, sinal });

export { montarConsulta };
