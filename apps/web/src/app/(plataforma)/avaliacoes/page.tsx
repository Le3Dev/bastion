"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { sistemaPorId } from "@/prototipo/armazem";
import { formatarDataHora } from "@/prototipo/formatacao";
import { rotuloDoEstadoDaAvaliacao, rotuloDoPerfil } from "@/prototipo/rotulos";
import type { EstadoDaAvaliacao } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";

const ESTADOS: EstadoDaAvaliacao[] = [
  "RASCUNHO",
  "AGUARDANDO_VERIFICACAO",
  "NA_FILA",
  "PREPARANDO",
  "EM_EXECUCAO",
  "ANALISANDO",
  "CONCLUIDA",
  "FALHOU",
  "CANCELADA",
];

const PaginaDeAvaliacoes = () => {
  const estado = useArmazem();
  const [filtroDeEstado, setFiltroDeEstado] = useState<EstadoDaAvaliacao | "">("");
  const [filtroDeSistema, setFiltroDeSistema] = useState("");

  const lista = useMemo(
    () =>
      estado.avaliacoes
        .filter((a) => (filtroDeEstado === "" || a.estado === filtroDeEstado) && (filtroDeSistema === "" || a.sistemaId === filtroDeSistema))
        .sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm)),
    [estado.avaliacoes, filtroDeEstado, filtroDeSistema],
  );

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Avaliações"
        descricao="Histórico e andamento das avaliações de segurança."
        acoes={
          <Link href="/avaliacoes/nova" className="btn btn-cta">
            Nova avaliação
          </Link>
        }
      />

      <div className="card">
        <div className="grade-2">
          <div className="field">
            <label className="label" htmlFor="filtro-estado">
              Estado
            </label>
            <select
              id="filtro-estado"
              className="input"
              value={filtroDeEstado}
              onChange={(e) => {
                const escolhido = ESTADOS.find((s) => s === e.target.value);
                setFiltroDeEstado(escolhido ?? "");
              }}
            >
              <option value="">Todos</option>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>
                  {rotuloDoEstadoDaAvaliacao(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="filtro-sistema">
              Sistema
            </label>
            <select
              id="filtro-sistema"
              className="input"
              value={filtroDeSistema}
              onChange={(e) => setFiltroDeSistema(e.target.value)}
            >
              <option value="">Todos</option>
              {estado.sistemas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {lista.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma avaliação encontrada"
            descricao="Ajuste os filtros ou solicite uma nova avaliação."
            acao={
              <Link href="/avaliacoes/nova" className="btn btn-cta">
                Nova avaliação
              </Link>
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Perfil</th>
                <th>Origem</th>
                <th>Estado</th>
                <th>Nota</th>
                <th>Solicitada em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td>{sistemaPorId(estado, a.sistemaId)?.nome ?? a.sistemaId}</td>
                  <td>{rotuloDoPerfil(a.perfil)}</td>
                  <td>{a.origem}</td>
                  <td>
                    <SeloDeEstado tipo="avaliacao" estado={a.estado} />
                  </td>
                  <td>
                    <NotaDeSeguranca nota={a.nota} />
                  </td>
                  <td>{formatarDataHora(a.solicitadaEm)}</td>
                  <td>
                    <Link href={`/avaliacoes/${a.id}`}>Abrir</Link>
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

export default PaginaDeAvaliacoes;
