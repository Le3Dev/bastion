"use client";

import type { EstadoDaAvaliacao } from "@bastion/contratos";
import Link from "next/link";
import { useState } from "react";
import { listarAvaliacoes } from "@/api/avaliacoes";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { listarSistemas } from "@/api/sistemas";
import { useConsulta } from "@/api/useConsulta";
import { usePaginacao } from "@/api/usePaginacao";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { estadosDaAvaliacaoDisponiveis, rotuloDoEstadoDaAvaliacao, rotuloDoPerfil } from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";

const LIMITE = 20;

const PaginaDeAvaliacoes = () => {
  const { pode } = useSessao();
  const [filtroDeEstado, setFiltroDeEstado] = useState<EstadoDaAvaliacao | "">("");
  const [filtroDeSistema, setFiltroDeSistema] = useState("");
  const sistemas = useConsulta(listarSistemas);

  const lista = usePaginacao(
    (pagina, sinal) =>
      listarAvaliacoes(
        {
          estado: filtroDeEstado === "" ? undefined : filtroDeEstado,
          sistemaId: filtroDeSistema === "" ? undefined : filtroDeSistema,
          pagina,
          limite: LIMITE,
        },
        sinal,
      ),
    `${filtroDeEstado}|${filtroDeSistema}`,
  );

  const podeSolicitar = pode("solicitarAvaliacao");
  const botaoNova = podeSolicitar ? (
    <Link href="/avaliacoes/nova" className="btn btn-cta">
      Nova avaliação
    </Link>
  ) : (
    <button type="button" className="btn btn-cta" disabled title={TEXTO_SEM_PERMISSAO}>
      Nova avaliação
    </button>
  );

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Avaliações"
        descricao="Histórico e andamento das avaliações de segurança."
        acoes={botaoNova}
      />

      {lista.erro ? <Alerta tipo="error">{lista.erro}</Alerta> : null}

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
                const escolhido = estadosDaAvaliacaoDisponiveis.find((s) => s === e.target.value);
                setFiltroDeEstado(escolhido ?? "");
              }}
            >
              <option value="">Todos</option>
              {estadosDaAvaliacaoDisponiveis.map((s) => (
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
              {(sistemas.dados ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {lista.carregando && lista.itens.length === 0 ? (
          <p className="texto-2">Carregando avaliações...</p>
        ) : lista.itens.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma avaliação encontrada"
            descricao="Ajuste os filtros ou solicite uma nova avaliação."
            acao={
              podeSolicitar ? (
                <Link href="/avaliacoes/nova" className="btn btn-cta">
                  Nova avaliação
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
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
                {lista.itens.map((a) => (
                  <tr key={a.id}>
                    <td>{a.sistemaNome}</td>
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
            {lista.temMais ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={lista.carregandoMais}
                onClick={() => void lista.carregarMais()}
              >
                {lista.carregandoMais ? "Carregando..." : "Carregar mais"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default PaginaDeAvaliacoes;
