"use client";

import { useState } from "react";
import { rotuloDoMetodoDeVerificacao } from "@/prototipo/rotulos";
import type { Sistema } from "@/prototipo/tipos";

interface PropsDasInstrucoes {
  sistema: Sistema;
}

/** O token do armazém já vem no formato "bastion-verificacao=<código>". */
const montarInstrucao = (sistema: Sistema): { passo: string; conteudo: string } => {
  const host = new URL(sistema.urlDeHomologacao).hostname;
  const { metodo, token } = sistema.verificacao;
  if (metodo === "DNS_TXT") {
    return {
      passo: `Crie um registro DNS do tipo TXT em _bastion-verificacao.${host} com o valor abaixo.`,
      conteudo: `Nome:  _bastion-verificacao.${host}\nTipo:  TXT\nValor: ${token}`,
    };
  }
  if (metodo === "ARQUIVO_WELL_KNOWN") {
    return {
      passo: `Publique em https://${host}/.well-known/bastion-verificacao.txt um arquivo contendo exatamente o token abaixo.`,
      conteudo: token,
    };
  }
  return {
    passo: `Faça a URL de homologação (${sistema.urlDeHomologacao}) responder com o cabeçalho abaixo.`,
    conteudo: `X-Bastion-Verificacao: ${token}`,
  };
};

export const InstrucoesDeVerificacao = ({ sistema }: PropsDasInstrucoes) => {
  const [copiado, setCopiado] = useState(false);
  const [erroAoCopiar, setErroAoCopiar] = useState<string | null>(null);
  const instrucao = montarInstrucao(sistema);

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(sistema.verificacao.token);
      setErroAoCopiar(null);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
      setErroAoCopiar("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  };

  return (
    <div className="pilha">
      <p className="texto-2">
        Método: {rotuloDoMetodoDeVerificacao(sistema.verificacao.metodo)}. {instrucao.passo}
      </p>
      <pre className="bloco-codigo">{instrucao.conteudo}</pre>
      <div className="linha">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void copiar()}>
          Copiar token
        </button>
        <span className="texto-2" aria-live="polite">
          {copiado ? "Copiado" : ""}
        </span>
        {erroAoCopiar ? <span className="erro-campo">{erroAoCopiar}</span> : null}
      </div>
    </div>
  );
};
