"use client";

import type { InstrucoesDeVerificacaoDto } from "@bastion/contratos";
import { useState } from "react";
import { rotuloDoMetodoDeVerificacao } from "@/apresentacao/rotulos";

interface PropsDasInstrucoes {
  instrucoes: InstrucoesDeVerificacaoDto;
}

const montarInstrucao = (instrucoes: InstrucoesDeVerificacaoDto): { passo: string; conteudo: string; copiavel: string } => {
  if (instrucoes.metodo === "DNS_TXT") {
    const { nome, valor } = instrucoes.registroDns;
    return {
      passo: `Crie um registro DNS do tipo TXT em ${nome} com o valor abaixo.`,
      conteudo: `Nome:  ${nome}\nTipo:  TXT\nValor: ${valor}`,
      copiavel: valor,
    };
  }
  if (instrucoes.metodo === "ARQUIVO_WELL_KNOWN") {
    const { url, conteudo } = instrucoes.arquivo;
    return {
      passo: `Publique em ${url} um arquivo contendo exatamente o texto abaixo.`,
      conteudo,
      copiavel: conteudo,
    };
  }
  const { nome, valor } = instrucoes.cabecalho;
  return {
    passo: "Faça o ambiente de homologação responder com o cabeçalho HTTP abaixo.",
    conteudo: `${nome}: ${valor}`,
    copiavel: valor,
  };
};

export const InstrucoesDeVerificacao = ({ instrucoes }: PropsDasInstrucoes) => {
  const [copiado, setCopiado] = useState(false);
  const [erroAoCopiar, setErroAoCopiar] = useState<string | null>(null);
  const instrucao = montarInstrucao(instrucoes);

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(instrucao.copiavel);
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
        Método: {rotuloDoMetodoDeVerificacao(instrucoes.metodo)}. {instrucao.passo}
      </p>
      <pre className="bloco-codigo">{instrucao.conteudo}</pre>
      <div className="linha">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void copiar()}>
          Copiar valor
        </button>
        <span className="texto-2" aria-live="polite">
          {copiado ? "Copiado" : ""}
        </span>
        {erroAoCopiar ? <span className="erro-campo">{erroAoCopiar}</span> : null}
      </div>
    </div>
  );
};
