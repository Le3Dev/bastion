"use client";

import { useState } from "react";
import { mensagemDoErro } from "./cliente";
import { useConsulta } from "./useConsulta";

interface Pagina<T> {
  itens: T[];
  proximaPagina: string | null;
}

interface Extra<T> {
  chave: string;
  itens: T[];
  proxima: string | null;
}

export interface ResultadoDaPaginacao<T> {
  itens: T[];
  erro: string | null;
  carregando: boolean;
  carregandoMais: boolean;
  temMais: boolean;
  carregarMais: () => Promise<void>;
}

/**
 * Lista paginada por cursor com "Carregar mais". A primeira página recarrega quando `chave` muda
 * (ela deve codificar os filtros); as páginas seguintes são acumuladas.
 */
export const usePaginacao = <T>(
  buscar: (pagina: string | undefined, sinal: AbortSignal) => Promise<Pagina<T>>,
  chave: string,
): ResultadoDaPaginacao<T> => {
  const primeira = useConsulta((sinal) => buscar(undefined, sinal), chave);
  const [extra, setExtra] = useState<Extra<T> | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroDeMais, setErroDeMais] = useState<string | null>(null);

  const extraValido = extra !== null && extra.chave === chave ? extra : null;
  const itens = [...(primeira.dados?.itens ?? []), ...(extraValido?.itens ?? [])];
  const proxima = extraValido ? extraValido.proxima : (primeira.dados?.proximaPagina ?? null);

  const carregarMais = async (): Promise<void> => {
    if (proxima === null || carregandoMais) return;
    setCarregandoMais(true);
    setErroDeMais(null);
    try {
      const pagina = await buscar(proxima, new AbortController().signal);
      setExtra((atual) => ({
        chave,
        itens: [...(atual !== null && atual.chave === chave ? atual.itens : []), ...pagina.itens],
        proxima: pagina.proximaPagina,
      }));
    } catch (e) {
      setErroDeMais(mensagemDoErro(e));
    } finally {
      setCarregandoMais(false);
    }
  };

  return {
    itens,
    erro: primeira.erro ?? erroDeMais,
    carregando: primeira.carregando,
    carregandoMais,
    temMais: proxima !== null,
    carregarMais,
  };
};
