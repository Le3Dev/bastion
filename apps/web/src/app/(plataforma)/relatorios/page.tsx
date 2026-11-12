"use client";

import Link from "next/link";
import { listarRelatorios } from "@/api/relatorios";
import { useConsulta } from "@/api/useConsulta";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";

const PaginaDeRelatorios = () => {
  const { dados, erro, carregando } = useConsulta((sinal) => listarRelatorios(undefined, sinal));
  const relatorios = dados ?? [];

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina titulo="Relatórios" descricao="Relatórios gerados ao concluir as avaliações." />

      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      <div className="card">
        {carregando && dados === null ? (
          <p className="texto-2">Carregando relatórios...</p>
        ) : relatorios.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum relatório ainda"
            descricao="Os relatórios aparecem quando uma avaliação é concluída."
            acao={
              <Link href="/avaliacoes" className="btn btn-outline">
                Ver avaliações
              </Link>
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Nota</th>
                <th>Gerado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {relatorios.map((r) => (
                <tr key={r.id}>
                  <td>{r.sistemaNome}</td>
                  <td>
                    <NotaDeSeguranca nota={r.nota} />
                  </td>
                  <td>{formatarDataHora(r.geradoEm)}</td>
                  <td>
                    <Link href={`/relatorios/${r.id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaginaDeRelatorios;
