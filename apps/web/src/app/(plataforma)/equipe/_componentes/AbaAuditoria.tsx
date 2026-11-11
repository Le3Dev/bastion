"use client";

import { useMemo, useState } from "react";
import { Alerta } from "@/componentes/Alerta";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { formatarDataHora } from "@/prototipo/formatacao";
import type { RegistroDeAuditoria } from "@/prototipo/tipos";

interface PropsDaAba {
  registros: RegistroDeAuditoria[];
}

const POR_PAGINA = 15;

const rotuloDoTipoDoAtor = (tipo: RegistroDeAuditoria["ator"]["tipo"]): string =>
  ({ USUARIO: "Usuário", SISTEMA: "Sistema", CHAVE_DE_API: "Chave de API" })[tipo];

export const AbaAuditoria = ({ registros }: PropsDaAba) => {
  const [ator, setAtor] = useState("");
  const [acao, setAcao] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const atores = useMemo(() => [...new Set(registros.map((r) => r.ator.nome))].sort((a, b) => a.localeCompare(b)), [registros]);
  const acoes = useMemo(() => [...new Set(registros.map((r) => r.acao))].sort((a, b) => a.localeCompare(b)), [registros]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return registros.filter((r) => {
      if (ator !== "" && r.ator.nome !== ator) return false;
      if (acao !== "" && r.acao !== acao) return false;
      if (termo !== "" && !`${r.alvo} ${r.detalhe ?? ""} ${r.acao} ${r.ator.nome}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [registros, ator, acao, busca]);

  const totalDePaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalDePaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  return (
    <div className="pilha">
      <Alerta tipo="info">Registros só de inclusão: não podem ser editados nem apagados.</Alerta>

      <div className="card">
        <div className="grade-3">
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="auditoria-ator">
              Ator
            </label>
            <select
              id="auditoria-ator"
              className="input"
              value={ator}
              onChange={(e) => {
                setAtor(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos</option>
              {atores.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="auditoria-acao">
              Ação
            </label>
            <select
              id="auditoria-acao"
              className="input"
              value={acao}
              onChange={(e) => {
                setAcao(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todas</option>
              {acoes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="auditoria-busca">
              Busca
            </label>
            <input
              id="auditoria-busca"
              type="search"
              className="input"
              placeholder="Alvo ou detalhe"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
      </div>

      <div className="card pilha">
        {visiveis.length === 0 ? (
          <EstadoVazio titulo="Nenhum registro encontrado" descricao="Ajuste os filtros para ver outros registros." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Ator</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => (
                <tr key={r.id}>
                  <td className="mono texto-2">{formatarDataHora(r.em)}</td>
                  <td>
                    <div>{r.ator.nome}</div>
                    <div className="texto-muted">{rotuloDoTipoDoAtor(r.ator.tipo)}</div>
                  </td>
                  <td className="mono">{r.acao}</td>
                  <td className="mono texto-2">{r.alvo}</td>
                  <td className="texto-2">{r.detalhe ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <span className="texto-2">
            {filtrados.length} {filtrados.length === 1 ? "registro" : "registros"} - página {paginaAtual} de {totalDePaginas}
          </span>
          <div className="linha">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina(paginaAtual - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={paginaAtual >= totalDePaginas}
              onClick={() => setPagina(paginaAtual + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
