"use client";

import { obterInstrucoesDeVerificacao } from "@/api/sistemas";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { InstrucoesDeVerificacao } from "./InstrucoesDeVerificacao";

/** Busca em GET /v1/sistemas/:id/verificacao e mostra as instruções. */
export const InstrucoesDoSistema = ({ sistemaId }: { sistemaId: string }) => {
  const { dados, erro, carregando } = useConsulta((sinal) => obterInstrucoesDeVerificacao(sistemaId, sinal), sistemaId);

  if (erro) return <Alerta tipo="error">{erro}</Alerta>;
  if (carregando || !dados) return <p className="texto-2">Carregando instruções...</p>;
  return <InstrucoesDeVerificacao instrucoes={dados} />;
};
