import { AgendamentoDto, type CorpoDeNovoAgendamento } from "@bastion/contratos";
import { z } from "zod";
import { requisitar, requisitarSemCorpo } from "./cliente";

/** Aceita `{ itens: [...] }` ou uma lista simples. */
const ListaDeAgendamentos = z.union([z.object({ itens: z.array(AgendamentoDto) }), z.array(AgendamentoDto)]);

export const listarAgendamentos = async (sinal?: AbortSignal): Promise<AgendamentoDto[]> => {
  const resposta = await requisitar("/v1/agendamentos", { esquema: ListaDeAgendamentos, sinal });
  return Array.isArray(resposta) ? resposta : resposta.itens;
};

export const criarAgendamento = (corpo: CorpoDeNovoAgendamento): Promise<AgendamentoDto> =>
  requisitar("/v1/agendamentos", { metodo: "POST", corpo, esquema: AgendamentoDto });

export const alterarAgendamento = (id: string, corpo: { ativo: boolean }): Promise<AgendamentoDto> =>
  requisitar(`/v1/agendamentos/${id}`, { metodo: "PATCH", corpo, esquema: AgendamentoDto });

export const removerAgendamento = (id: string): Promise<undefined> =>
  requisitarSemCorpo(`/v1/agendamentos/${id}`, { metodo: "DELETE" });
