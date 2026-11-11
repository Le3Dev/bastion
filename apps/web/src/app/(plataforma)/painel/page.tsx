"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import { achadosEmAberto, contagemPorSeveridade, sistemaPorId } from "@/prototipo/armazem";
import { formatarDataHora } from "@/prototipo/formatacao";
import { ehEstadoFinalDaAvaliacao } from "@/prototipo/maquinas-de-estado";
import { ordemDasSeveridades, rotuloDaSeveridade } from "@/prototipo/rotulos";
import { useArmazem } from "@/prototipo/useArmazem";

const PaginaDoPainel = () => {
  const estado = useArmazem();

  const resumo = useMemo(() => {
    const notas = estado.sistemas.flatMap((s) => (s.ultimaNota === null ? [] : [s.ultimaNota]));
    const notaMedia = notas.length > 0 ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
    const abertos = achadosEmAberto(estado);
    const verificados = estado.sistemas.filter((s) => s.verificacao.estado === "VERIFICADO").length;
    const pendentes = estado.sistemas.filter((s) => s.verificacao.estado !== "VERIFICADO");
    const emAndamento = estado.avaliacoes.filter(
      (a) => !ehEstadoFinalDaAvaliacao(a.estado) && a.estado !== "RASCUNHO",
    ).length;
    const recentes = [...estado.avaliacoes]
      .sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm))
      .slice(0, 5);
    const criticosEAltos = abertos.filter((a) => a.severidade === "CRITICA" || a.severidade === "ALTA");
    return {
      notaMedia,
      contagem: contagemPorSeveridade(abertos),
      totalAbertos: abertos.length,
      verificados,
      pendentes,
      emAndamento,
      recentes,
      criticosEAltos,
    };
  }, [estado]);

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Painel"
        descricao="Visão geral da segurança dos sistemas da organização."
        acoes={
          <Link href="/avaliacoes/nova" className="btn btn-cta">
            Nova avaliação
          </Link>
        }
      />

      <div className="grade-4">
        <div className="card kpi">
          <span className="kpi-rotulo">Nota média dos sistemas</span>
          <NotaDeSeguranca nota={resumo.notaMedia} tamanho="grande" />
        </div>
        <div className="card kpi">
          <span className="kpi-rotulo">Achados em aberto</span>
          <span className="kpi-valor">{resumo.totalAbertos}</span>
          <div className="linha">
            {ordemDasSeveridades.map((sev) => (
              <span key={sev} className="texto-2">
                {rotuloDaSeveridade(sev)}: <span className="mono">{resumo.contagem[sev]}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="card kpi">
          <span className="kpi-rotulo">Sistemas verificados × pendentes</span>
          <span className="kpi-valor">
            {resumo.verificados} × {resumo.pendentes.length}
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-rotulo">Avaliações em andamento</span>
          <span className="kpi-valor">{resumo.emAndamento}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Avaliações recentes</h2>
        {resumo.recentes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma avaliação ainda" descricao="Solicite a primeira avaliação de um sistema verificado." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Estado</th>
                <th>Nota</th>
                <th>Solicitada em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {resumo.recentes.map((a) => (
                <tr key={a.id}>
                  <td>{sistemaPorId(estado, a.sistemaId)?.nome ?? a.sistemaId}</td>
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

      <div className="grade-2">
        <div className="card">
          <h2 className="card-titulo">Achados críticos e altos em aberto</h2>
          {resumo.criticosEAltos.length === 0 ? (
            <EstadoVazio titulo="Nenhum achado crítico ou alto em aberto" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Severidade</th>
                  <th>Achado</th>
                  <th>Sistema</th>
                </tr>
              </thead>
              <tbody>
                {resumo.criticosEAltos.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <TagDeSeveridade severidade={a.severidade} />
                    </td>
                    <td>
                      <Link href={`/achados/${a.id}`}>{a.titulo}</Link>
                    </td>
                    <td className="texto-2">{sistemaPorId(estado, a.sistemaId)?.nome ?? a.sistemaId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="card-titulo">Sistemas pendentes de verificação</h2>
          {resumo.pendentes.length === 0 ? (
            <EstadoVazio titulo="Todos os sistemas estão verificados" />
          ) : (
            <div className="pilha">
              {resumo.pendentes.map((s) => (
                <div key={s.id} className="linha" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div>{s.nome}</div>
                    <div className="texto-muted mono">{s.urlDeHomologacao}</div>
                  </div>
                  <SeloDeEstado tipo="verificacao" estado={s.verificacao.estado} />
                </div>
              ))}
              <Link href="/sistemas" className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }}>
                Ver sistemas
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaginaDoPainel;
