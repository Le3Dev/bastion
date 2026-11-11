import type { ReactNode } from "react";

interface PropsDoCabecalho {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}

export const CabecalhoDaPagina = ({ titulo, descricao, acoes }: PropsDoCabecalho) => (
  <header className="cabecalho-pagina">
    <div>
      <h1>{titulo}</h1>
      {descricao ? <p className="texto-2">{descricao}</p> : null}
    </div>
    {acoes ? <div className="linha">{acoes}</div> : null}
  </header>
);
