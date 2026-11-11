"use client";

import { useState } from "react";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { useArmazem } from "@/prototipo/useArmazem";
import { AbaAuditoria } from "./_componentes/AbaAuditoria";
import { AbaMembros } from "./_componentes/AbaMembros";

type AbaDaEquipe = "membros" | "auditoria";

const PaginaDaEquipe = () => {
  const estado = useArmazem();
  const [aba, setAba] = useState<AbaDaEquipe>("membros");
  const somenteLeitura = estado.usuarioAtual?.papel === "LEITOR";

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina titulo="Equipe e auditoria" descricao="Quem tem acesso à organização e o que foi feito nela." />
      <div className="abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === "membros"}
          className={aba === "membros" ? "aba aba-ativa" : "aba"}
          onClick={() => setAba("membros")}
        >
          Membros
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "auditoria"}
          className={aba === "auditoria" ? "aba aba-ativa" : "aba"}
          onClick={() => setAba("auditoria")}
        >
          Auditoria
        </button>
      </div>
      {aba === "membros" ? (
        <AbaMembros membros={estado.membros} somenteLeitura={somenteLeitura} />
      ) : (
        <AbaAuditoria registros={estado.auditoria} />
      )}
    </div>
  );
};

export default PaginaDaEquipe;
