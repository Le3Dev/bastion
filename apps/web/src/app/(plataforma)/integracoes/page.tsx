"use client";

import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { SecaoChavesDeApi } from "./_componentes/SecaoChavesDeApi";
import { SecaoUsoNoCi } from "./_componentes/SecaoUsoNoCi";
import { SecaoWebhooks } from "./_componentes/SecaoWebhooks";

const INTEGRACOES_FORA_DO_MVP = ["Jira", "Slack", "Teams"];

const PaginaDeIntegracoes = () => (
  <div className="page-wide pilha">
    <CabecalhoDaPagina
      titulo="Integrações"
      descricao="Conecte o Bastion ao seu pipeline de CI e receba eventos por webhook."
    />
    <SecaoChavesDeApi />
    <SecaoUsoNoCi />
    <SecaoWebhooks />

    <div className="card pilha">
      <h2 className="card-titulo">Outras integrações</h2>
      <div className="grade-3">
        {INTEGRACOES_FORA_DO_MVP.map((nome) => (
          <div key={nome} className="card" aria-disabled="true" style={{ opacity: 0.55 }}>
            <div className="linha" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{nome}</h3>
              <span className="tag tag-neutra">FORA DO MVP</span>
            </div>
            <p className="texto-2" style={{ marginTop: "var(--esp-2)" }}>
              Disponível depois do MVP.
            </p>
            <button type="button" className="btn btn-outline btn-sm" disabled>
              Conectar
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default PaginaDeIntegracoes;
