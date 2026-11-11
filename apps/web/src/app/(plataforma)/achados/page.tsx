"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import { achadosEmAberto, contagemPorSeveridade, sistemaPorId } from "@/prototipo/armazem";
import { formatarDataHora } from "@/prototipo/formatacao";
import {
  classeDaSeveridade,
  estadosDoAchadoDisponiveis,
  ordemDasSeveridades,
  rotuloDaSeveridade,
  rotuloDoEstadoDoAchado,
} from "@/prototipo/rotulos";
import type { EstadoDoAchado, Severidade } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";
import estilos from "./_componentes/filtros.module.css";

const TEXTO_DA_DEDUPLICACAO =
  "Quantas avaliações encontraram este mesmo problema. Achados repetidos são agrupados pela impressão digital (sistema, tipo e local), então não aparecem duplicados.";

const PaginaDeAchados = () => {
  const estado = useArmazem();
  const [severidades, setSeveridades] = useState<Severidade[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoDoAchado | "">("");
  const [sistemaFiltro, setSistemaFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);

  const contagem = useMemo(() => contagemPorSeveridade(achadosEmAberto(estado)), [estado]);
  const totalEmAberto = useMemo(() => achadosEmAberto(estado).length, [estado]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const incluirEncerrados =
      mostrarEncerrados || estadoFiltro === "CORRIGIDO" || estadoFiltro === "RISCO_ACEITO";
    return estado.achados
      .filter((a) => {
        if (!incluirEncerrados && (a.estado === "CORRIGIDO" || a.estado === "RISCO_ACEITO")) return false;
        if (severidades.length > 0 && !severidades.includes(a.severidade)) return false;
        if (estadoFiltro !== "" && a.estado !== estadoFiltro) return false;
        if (sistemaFiltro !== "" && a.sistemaId !== sistemaFiltro) return false;
        if (termo !== "" && !`${a.titulo} ${a.local} ${a.tipo}`.toLowerCase().includes(termo)) return false;
        return true;
      })
      .sort((a, b) => {
        const porSeveridade = ordemDasSeveridades.indexOf(a.severidade) - ordemDasSeveridades.indexOf(b.severidade);
        if (porSeveridade !== 0) return porSeveridade;
        return b.ultimaVezEm.localeCompare(a.ultimaVezEm);
      });
  }, [estado.achados, severidades, estadoFiltro, sistemaFiltro, busca, mostrarEncerrados]);

  const alternarSeveridade = (sev: Severidade) => {
    setSeveridades((atual) => (atual.includes(sev) ? atual.filter((s) => s !== sev) : [...atual, sev]));
  };

  const aoMudarEstado = (valor: string) => {
    setEstadoFiltro(estadosDoAchadoDisponiveis.find((e) => e === valor) ?? "");
  };

  const limparFiltros = () => {
    setSeveridades([]);
    setEstadoFiltro("");
    setSistemaFiltro("");
    setBusca("");
    setMostrarEncerrados(false);
  };

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina titulo="Achados" descricao="Problemas de segurança encontrados nas avaliações, sem duplicidade." />

      <div className="grade-4">
        {ordemDasSeveridades.map((sev) => (
          <div key={sev} className="card kpi">
            <span className="kpi-rotulo">Em aberto: {rotuloDaSeveridade(sev)}</span>
            <span className="kpi-valor">{contagem[sev]}</span>
          </div>
        ))}
      </div>
      <p className="texto-2">
        {totalEmAberto} {totalEmAberto === 1 ? "achado em aberto" : "achados em aberto"} no total.
      </p>

      <div className="card">
        <h2 className="card-titulo">Filtros</h2>
        <div className={estilos.filtros}>
          <div className={estilos.campo}>
            <span className="label">Severidade</span>
            <div className="linha">
              {ordemDasSeveridades.map((sev) => {
                const ativa = severidades.includes(sev);
                return (
                  <button
                    key={sev}
                    type="button"
                    aria-pressed={ativa}
                    className={`tag ${classeDaSeveridade(sev)} ${estilos.filtro} ${ativa ? estilos.filtroAtivo : ""}`}
                    onClick={() => alternarSeveridade(sev)}
                  >
                    {rotuloDaSeveridade(sev)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={estilos.campo}>
            <label className="label" htmlFor="filtro-estado">
              Estado
            </label>
            <select
              id="filtro-estado"
              className="input"
              value={estadoFiltro}
              onChange={(e) => aoMudarEstado(e.target.value)}
            >
              <option value="">Todos</option>
              {estadosDoAchadoDisponiveis.map((e) => (
                <option key={e} value={e}>
                  {rotuloDoEstadoDoAchado(e)}
                </option>
              ))}
            </select>
          </div>
          <div className={estilos.campo}>
            <label className="label" htmlFor="filtro-sistema">
              Sistema
            </label>
            <select
              id="filtro-sistema"
              className="input"
              value={sistemaFiltro}
              onChange={(e) => setSistemaFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              {estado.sistemas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div className={estilos.campo}>
            <label className="label" htmlFor="filtro-busca">
              Busca
            </label>
            <input
              id="filtro-busca"
              type="search"
              className="input"
              placeholder="Título, local ou tipo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="linha" style={{ marginTop: "var(--esp-4)" }}>
          <label className="linha">
            <input
              type="checkbox"
              checked={mostrarEncerrados}
              onChange={(e) => setMostrarEncerrados(e.target.checked)}
            />
            <span>Mostrar corrigidos e risco aceito</span>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="card">
        {filtrados.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum achado encontrado"
            descricao="Ajuste os filtros ou marque a opção de mostrar corrigidos e risco aceito."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Título</th>
                <th>Sistema</th>
                <th>Local</th>
                <th>Estado</th>
                <th>Ocorrências</th>
                <th>Última vez</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <tr key={a.id}>
                  <td>
                    <TagDeSeveridade severidade={a.severidade} />
                  </td>
                  <td>
                    <Link href={`/achados/${a.id}`}>{a.titulo}</Link>
                  </td>
                  <td className="texto-2">{sistemaPorId(estado, a.sistemaId)?.nome ?? a.sistemaId}</td>
                  <td className="mono texto-2">{a.local}</td>
                  <td>
                    <SeloDeEstado tipo="achado" estado={a.estado} />
                  </td>
                  <td className={`mono ${estilos.linhaDeOcorrencias}`} title={TEXTO_DA_DEDUPLICACAO}>
                    {a.ocorrencias}×
                  </td>
                  <td className="texto-2">{formatarDataHora(a.ultimaVezEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaginaDeAchados;
