"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { foiCancelada, mensagemDoErro } from "./cliente";

export interface ResultadoDaConsulta<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
  recarregar: () => void;
}

interface Desfecho<T> {
  rodada: string;
  dados: T | null;
  erro: string | null;
}

/**
 * Busca dados ao montar e sempre que `chave` mudar. Cancela a chamada anterior com AbortController.
 * `buscar` pode mudar a cada render sem disparar nova busca: só `chave` (ou `recarregar`) reinicia a consulta.
 * Durante uma recarga, `dados` mantém o último valor bom.
 */
export const useConsulta = <T>(
  buscar: (sinal: AbortSignal) => Promise<T>,
  chave: string = "",
): ResultadoDaConsulta<T> => {
  const [versao, setVersao] = useState(0);
  const [desfecho, setDesfecho] = useState<Desfecho<T> | null>(null);
  const buscarRef = useRef(buscar);
  const rodada = `${chave}#${versao}`;

  useEffect(() => {
    buscarRef.current = buscar;
  });

  useEffect(() => {
    const controlador = new AbortController();
    buscarRef
      .current(controlador.signal)
      .then((resultado) => setDesfecho({ rodada, dados: resultado, erro: null }))
      .catch((e: unknown) => {
        if (foiCancelada(e)) return;
        setDesfecho((atual) => ({ rodada, dados: atual?.dados ?? null, erro: mensagemDoErro(e) }));
      });
    return () => controlador.abort();
  }, [rodada]);

  const recarregar = useCallback((): void => setVersao((v) => v + 1), []);

  return {
    dados: desfecho?.dados ?? null,
    erro: desfecho?.rodada === rodada ? desfecho.erro : null,
    carregando: desfecho?.rodada !== rodada,
    recarregar,
  };
};
