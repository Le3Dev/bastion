"use client";

import { useState } from "react";
import { Alerta } from "@/componentes/Alerta";
import { exemploAzurePipelines, exemploComCurl, exemploGitHubActions } from "./exemplos";

type AbaDoCi = "github" | "azure";

export const SecaoUsoNoCi = () => {
  const [aba, setAba] = useState<AbaDoCi>("github");

  return (
    <div className="card pilha">
      <h2 className="card-titulo">Uso no CI</h2>
      <p className="texto-2">
        O pipeline solicita uma avaliação, consulta até um estado final e reprova o build se a nota for menor que a
        mínima. Guarde a chave de API em um secret chamado <span className="mono">BASTION_API_KEY</span>; nunca a escreva no
        arquivo do pipeline.
      </p>
      <div className="abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === "github"}
          className={aba === "github" ? "aba aba-ativa" : "aba"}
          onClick={() => setAba("github")}
        >
          GitHub Actions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "azure"}
          className={aba === "azure" ? "aba aba-ativa" : "aba"}
          onClick={() => setAba("azure")}
        >
          Azure Pipelines
        </button>
      </div>
      <pre className="bloco-codigo">{aba === "github" ? exemploGitHubActions : exemploAzurePipelines}</pre>
      <h3>Exemplo com curl</h3>
      <pre className="bloco-codigo">{exemploComCurl}</pre>
      <Alerta tipo="info">A API real chega na Fase 2. Hoje os exemplos servem de referência do contrato.</Alerta>
    </div>
  );
};
