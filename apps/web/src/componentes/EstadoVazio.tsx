import type { ReactNode } from "react";

interface PropsDoEstadoVazio {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}

export const EstadoVazio = ({ titulo, descricao, acao }: PropsDoEstadoVazio) => (
  <div className="estado-vazio">
    <p className="titulo">{titulo}</p>
    {descricao ? <p className="texto-2">{descricao}</p> : null}
    {acao ?? null}
  </div>
);
