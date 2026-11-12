"use client";

import {
  AchadoResumoDto,
  AvaliacaoDto,
  RequisicaoDoGuardiaoDto,
  type AchadoResumoDto as TipoDeAchadoResumo,
  type AvaliacaoDto as TipoDeAvaliacao,
  type RequisicaoDoGuardiaoDto as TipoDeRequisicao,
} from "@bastion/contratos";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { ehEstadoFinalDaAvaliacao } from "@/apresentacao/rotulos";
import { listarAchadosDaAvaliacao, listarRequisicoesDaAvaliacao, obterAvaliacao } from "./avaliacoes";
import { URL_DA_API, foiCancelada, mensagemDoErro } from "./cliente";

const INTERVALO_DA_CONSULTA_MS = 3000;

export interface EstadoAoVivo {
  avaliacao: TipoDeAvaliacao | null;
  requisicoes: TipoDeRequisicao[];
  achados: TipoDeAchadoResumo[];
  erro: string | null;
  /** "sse" com o fluxo ligado; "consulta" quando caiu para a consulta a cada 3 s; "encerrado" no estado final. */
  modo: "sse" | "consulta" | "encerrado";
}

const estadoInicial: EstadoAoVivo = { avaliacao: null, requisicoes: [], achados: [], erro: null, modo: "sse" };

const juntarPorId = <T extends { id: string }>(lista: T[], novos: T[]): T[] => {
  const mapa = new Map(lista.map((item) => [item.id, item]));
  for (const item of novos) mapa.set(item.id, item);
  return [...mapa.values()];
};

const lerEvento = <T>(esquema: z.ZodType<T>, evento: Event): T | null => {
  try {
    const bruto: unknown = JSON.parse(String((evento as MessageEvent).data));
    const analisado = esquema.safeParse(bruto);
    return analisado.success ? analisado.data : null;
  } catch {
    return null;
  }
};

/**
 * Acompanha uma avaliação: abre o SSE e junta os eventos `avaliacao`, `requisicao` e `achado`.
 * Se o SSE falhar, consulta a API a cada 3 s até o estado final. Fecha tudo no unmount e no estado final.
 * Use `key={avaliacaoId}` no componente que chama o hook para reiniciar o estado ao trocar de avaliação.
 */
export const useAoVivo = (avaliacaoId: string): EstadoAoVivo => {
  const [estado, setEstado] = useState<EstadoAoVivo>(estadoInicial);

  useEffect(() => {
    let ativo = true;
    let fonte: EventSource | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let controlador: AbortController | null = null;

    const encerrar = (): void => {
      fonte?.close();
      fonte = null;
      if (temporizador) clearTimeout(temporizador);
      temporizador = null;
      controlador?.abort();
    };

    /** `periodica`: repete a cada 3 s até o estado final. Sem ela, é só um retrato inicial/final. */
    const consultar = async (periodica: boolean): Promise<void> => {
      controlador = new AbortController();
      try {
        const [avaliacao, requisicoes, achados] = await Promise.all([
          obterAvaliacao(avaliacaoId, controlador.signal),
          listarRequisicoesDaAvaliacao(avaliacaoId, controlador.signal),
          listarAchadosDaAvaliacao(avaliacaoId, { limite: 100 }, controlador.signal),
        ]);
        if (!ativo) return;
        const final = ehEstadoFinalDaAvaliacao(avaliacao.estado);
        setEstado((atual) => ({
          avaliacao: atual.modo === "encerrado" && !final ? atual.avaliacao : avaliacao,
          requisicoes: juntarPorId(atual.requisicoes, requisicoes),
          achados: juntarPorId(atual.achados, achados.itens),
          erro: null,
          modo: final ? "encerrado" : periodica ? "consulta" : atual.modo,
        }));
        if (final) {
          encerrar();
        } else if (periodica) {
          temporizador = setTimeout(() => void consultar(true), INTERVALO_DA_CONSULTA_MS);
        }
      } catch (e) {
        if (!ativo || foiCancelada(e)) return;
        setEstado((atual) => ({ ...atual, erro: mensagemDoErro(e), modo: periodica ? "consulta" : atual.modo }));
        if (periodica) temporizador = setTimeout(() => void consultar(true), INTERVALO_DA_CONSULTA_MS);
      }
    };

    const passarParaConsulta = (): void => {
      if (!ativo) return;
      fonte?.close();
      fonte = null;
      if (temporizador) return;
      setEstado((atual) => (atual.modo === "encerrado" ? atual : { ...atual, modo: "consulta" }));
      void consultar(true);
    };

    try {
      fonte = new EventSource(`${URL_DA_API}/v1/avaliacoes/${avaliacaoId}/eventos`, { withCredentials: true });
      fonte.addEventListener("avaliacao", (evento) => {
        const avaliacao = lerEvento(AvaliacaoDto, evento);
        if (!avaliacao || !ativo) return;
        const final = ehEstadoFinalDaAvaliacao(avaliacao.estado);
        setEstado((atual) => ({ ...atual, avaliacao, erro: null, modo: final ? "encerrado" : "sse" }));
        if (final) {
          encerrar();
          // Retrato final: garante a lista completa de requisições e achados.
          void consultar(false);
        }
      });
      fonte.addEventListener("requisicao", (evento) => {
        const requisicao = lerEvento(RequisicaoDoGuardiaoDto, evento);
        if (requisicao && ativo) {
          setEstado((atual) => ({ ...atual, requisicoes: juntarPorId(atual.requisicoes, [requisicao]) }));
        }
      });
      fonte.addEventListener("achado", (evento) => {
        const achado = lerEvento(AchadoResumoDto, evento);
        if (achado && ativo) setEstado((atual) => ({ ...atual, achados: juntarPorId(atual.achados, [achado]) }));
      });
      fonte.onerror = () => passarParaConsulta();
      // Retrato inicial, caso o servidor não reenvie o que já aconteceu ao conectar.
      void consultar(false);
    } catch {
      passarParaConsulta();
    }

    return () => {
      ativo = false;
      encerrar();
    };
  }, [avaliacaoId]);

  return estado;
};
