"use client";

import type { EstadoDoAchado, Severidade } from "@bastion/contratos";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { listarAchados } from "@/api/achados";
import { obterPainel } from "@/api/painel";
import { listarSistemas } from "@/api/sistemas";
import { useConsulta } from "@/api/useConsulta";
import { usePaginacao } from "@/api/usePaginacao";
import { formatarDataHora } from "@/apresentacao/formatacao";
import {
  classeDaSeveridade,
  estadosDoAchadoDisponiveis,
  ordemDasSeveridades,
  rotuloDaSeveridade,
  rotuloDoEstadoDoAchado,
} from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import estilos from "./_componentes/filtros.module.css";

const LIMITE = 20;

const TEXTO_DA_DEDUPLICACAO =
  "Quantas avaliações encontraram este mesmo problema. Achados repetidos são agrupados pela impressão digital (sistema, tipo e local), então não aparecem duplicados.";

const PaginaDeAchados = () => {
  const [severidades, setSeveridades] = useState<Severidade[]>([]);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoDoAchado | "">("");
  const [sistemaFiltro, setSistemaFiltro] = useState("");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [incluirFechados, setIncluirFechados] = useState(false);

  const sistemas = useConsulta(listarSistemas);
  const painel = useConsulta(obterPainel);

  const lista = usePaginacao(
    (pagina, sinal) =>
      listarAchados(
        {
          severidades,
          estado: estadoFiltro === "" ? undefined : estadoFiltro,
          sistemaId: sistemaFiltro === "" ? undefined : sistemaFiltro,
          busca,
          incluirFechados,
          pagina,
          limite: LIMITE,
        },
        sinal,
      ),
    [severidades.join(","), estadoFiltro, sistemaFiltro, busca, incluirFechados].join("|"),
  );

  const contagem = painel.dados?.achadosEmAbertoPorSeveridade;
  const totalEmAberto = contagem ? ordemDasSeveridades.reduce((soma, sev) => soma + (contagem[sev] ?? 0), 0) : null;

  const alternarSeveridade = (sev: Severidade): void => {
    setSeveridades((atual) => (atual.includes(sev) ? atual.filter((s) => s !== sev) : [...atual, sev]));
  };

  const limparFiltros = (): void => {
    setSeveridades([]);
    setEstadoFiltro("");
    setSistemaFiltro("");
    setBuscaDigitada("");
    setBusca("");
    setIncluirFechados(false);
  };

  const buscar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setBusca(buscaDigitada.trim());
  };

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina titulo="Achados" descricao="Problemas de segurança encontrados nas avaliações, sem duplicidade." />

      <div className="grade-4">
        {ordemDasSeveridades.map((sev) => (
          <div key={sev} className="card kpi">
            <span className="kpi-rotulo">Em aberto: {rotuloDaSeveridade(sev)}</span>
            <span className="kpi-valor">{contagem ? (contagem[sev] ?? 0) : "--"}</span>
          </div>
        ))}
      </div>
      {totalEmAberto !== null ? (
        <p className="texto-2">
          {totalEmAberto} {totalEmAberto === 1 ? "achado em aberto" : "achados em aberto"} no total.
        </p>
      ) : null}

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
              onChange={(e) => setEstadoFiltro(estadosDoAchadoDisponiveis.find((s) => s === e.target.value) ?? "")}
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
              {(sistemas.dados ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <form className={estilos.campo} onSubmit={buscar} role="search">
            <label className="label" htmlFor="filtro-busca">
              Busca
            </label>
            <div className="linha">
              <input
                id="filtro-busca"
                type="search"
                className="input"
                placeholder="Título, local ou tipo"
                value={buscaDigitada}
                onChange={(e) => setBuscaDigitada(e.target.value)}
              />
              <button type="submit" className="btn btn-outline btn-sm">
                Buscar
              </button>
            </div>
          </form>
        </div>
        <div className="linha" style={{ marginTop: "var(--esp-4)" }}>
          <label className="linha">
            <input type="checkbox" checked={incluirFechados} onChange={(e) => setIncluirFechados(e.target.checked)} />
            <span>Mostrar corrigidos e risco aceito</span>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      </div>

      {lista.erro ? <Alerta tipo="error">{lista.erro}</Alerta> : null}

      <div className="card">
        {lista.carregando && lista.itens.length === 0 ? (
          <p className="texto-2">Carregando achados...</p>
        ) : lista.itens.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum achado encontrado"
            descricao="Ajuste os filtros ou marque a opção de mostrar corrigidos e risco aceito."
          />
        ) : (
          <>
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
                {lista.itens.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <TagDeSeveridade severidade={a.severidade} />
                    </td>
                    <td>
                      <Link href={`/achados/${a.id}`}>{a.titulo}</Link>
                    </td>
                    <td className="texto-2">{a.sistemaNome}</td>
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

export default PaginaDeAchados;
