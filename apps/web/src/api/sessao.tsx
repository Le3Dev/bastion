"use client";

import type { Papel, RespostaDeSessao } from "@bastion/contratos";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alerta } from "@/componentes/Alerta";
import { ErroDaApi, foiCancelada, mensagemDoErro } from "./cliente";
import { obterSessao, sair as encerrarSessao } from "./contas";

/** Permissões de interface; o servidor continua sendo a fonte da verdade. */
export type Permissao = "sistemas" | "membros" | "chaves" | "webhooks";

const PAPEIS_POR_PERMISSAO: Record<Permissao, readonly Papel[]> = {
  sistemas: ["DONO", "ADMIN", "ANALISTA"],
  membros: ["DONO", "ADMIN"],
  chaves: ["DONO", "ADMIN"],
  webhooks: ["DONO", "ADMIN"],
};

export const TEXTO_SEM_PERMISSAO = "Seu papel não permite esta ação";

interface ValorDaSessao {
  usuario: RespostaDeSessao["usuario"];
  organizacao: RespostaDeSessao["organizacao"];
  papel: Papel;
  pode: (permissao: Permissao) => boolean;
  sair: () => Promise<void>;
}

const ContextoDaSessao = createContext<ValorDaSessao | null>(null);

export const SessaoProvider = ({ children }: { children: ReactNode }) => {
  const roteador = useRouter();
  const [sessao, setSessao] = useState<RespostaDeSessao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();
    obterSessao(controlador.signal)
      .then((resposta) => {
        setSessao(resposta);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (foiCancelada(e)) return;
        if (e instanceof ErroDaApi && e.status === 401) {
          roteador.replace("/login");
          return;
        }
        setErro(mensagemDoErro(e));
      });
    return () => controlador.abort();
  }, [roteador, tentativa]);

  const sair = useCallback(async (): Promise<void> => {
    try {
      await encerrarSessao();
    } finally {
      roteador.replace("/login");
    }
  }, [roteador]);

  const valor = useMemo<ValorDaSessao | null>(
    () =>
      sessao
        ? {
            usuario: sessao.usuario,
            organizacao: sessao.organizacao,
            papel: sessao.papel,
            pode: (permissao) => PAPEIS_POR_PERMISSAO[permissao].includes(sessao.papel),
            sair,
          }
        : null,
    [sessao, sair],
  );

  if (erro) {
    return (
      <main className="login-pagina">
        <div className="card login-cartao pilha">
          <Alerta tipo="error">{erro}</Alerta>
          <button type="button" className="btn btn-cta" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }

  if (!valor) {
    return (
      <main className="login-pagina">
        <p className="texto-2" role="status">
          Carregando...
        </p>
      </main>
    );
  }

  return <ContextoDaSessao.Provider value={valor}>{children}</ContextoDaSessao.Provider>;
};

export const useSessao = (): ValorDaSessao => {
  const valor = useContext(ContextoDaSessao);
  if (!valor) throw new Error("useSessao precisa estar dentro de SessaoProvider.");
  return valor;
};
