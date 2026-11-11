"use client";

import { useState } from "react";

interface PropsDoBotaoDeConfirmacao {
  rotulo: string;
  rotuloDeConfirmacao?: string;
  aoConfirmar: () => void;
  desabilitado?: boolean;
  titulo?: string;
}

/** Ação destrutiva em dois cliques: o primeiro arma, o segundo executa. Perder o foco desarma. */
export const BotaoDeConfirmacao = ({
  rotulo,
  rotuloDeConfirmacao = "Confirmar?",
  aoConfirmar,
  desabilitado = false,
  titulo,
}: PropsDoBotaoDeConfirmacao) => {
  const [armado, setArmado] = useState(false);

  const aoClicar = () => {
    if (!armado) {
      setArmado(true);
      return;
    }
    setArmado(false);
    aoConfirmar();
  };

  return (
    <button
      type="button"
      className={armado ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm"}
      onClick={aoClicar}
      onBlur={() => setArmado(false)}
      disabled={desabilitado}
      title={titulo}
    >
      {armado ? rotuloDeConfirmacao : rotulo}
    </button>
  );
};
