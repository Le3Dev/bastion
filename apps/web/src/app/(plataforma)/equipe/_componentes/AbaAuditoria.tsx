"use client";

import type { RegistroDeAuditoriaDto } from "@bastion/contratos";
import { useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { listarAuditoria, type FiltrosDeAuditoria } from "@/api/auditoria";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { formatarDataHora } from "@/apresentacao/formatacao";

const POR_PAGINA = 20;

const rotuloDoTipoDoAtor = (tipo: RegistroDeAuditoriaDto["ator"]["tipo"]): string =>
  ({ USUARIO: "Usuário", SISTEMA: "Sistema", CHAVE_DE_API: "Chave de API" })[tipo];

const resumirDetalhe = (detalhe: RegistroDeAuditoriaDto["detalhe"]): string => {
  if (detalhe === null) return "-";
  return Object.entries(detalhe)
    .map(([chave, valor]) => `${chave}: ${typeof valor === "string" ? valor : JSON.stringify(valor)}`)
    .join(", ");
};

interface PropsDaLista {
  filtros: FiltrosDeAuditoria;
}

/** Remontado (via key) a cada novo conjunto de filtros, o que zera as páginas já acumuladas. */
const ListaDeAuditoria = ({ filtros }: PropsDaLista) => {
  const primeira = useConsulta((sinal) => listarAuditoria({ ...filtros, limite: POR_PAGINA }, sinal));
  const [extras, setExtras] = useState<RegistroDeAuditoriaDto[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroAoCarregarMais, setErroAoCarregarMais] = useState<string | null>(null);

  const proximaPagina = cursor === undefined ? (primeira.dados?.proximaPagina ?? null) : cursor;
  const registros = [...(primeira.dados?.itens ?? []), ...extras];

  const carregarMais = async (): Promise<void> => {
    if (proximaPagina === null) return;
    setErroAoCarregarMais(null);
    setCarregandoMais(true);
    try {
      const pagina = await listarAuditoria({ ...filtros, limite: POR_PAGINA, pagina: proximaPagina });
      setExtras((atual) => [...atual, ...pagina.itens]);
      setCursor(pagina.proximaPagina);
    } catch (e) {
      setErroAoCarregarMais(mensagemDoErro(e));
    } finally {
      setCarregandoMais(false);
    }
  };

  return (
    <div className="card pilha">
      {primeira.erro ? <Alerta tipo="error">{primeira.erro}</Alerta> : null}
      {erroAoCarregarMais ? <Alerta tipo="error">{erroAoCarregarMais}</Alerta> : null}
      {primeira.carregando ? (
        <p className="texto-2">Carregando registros...</p>
      ) : registros.length === 0 ? (
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
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="mono texto-2">{formatarDataHora(r.em)}</td>
                <td>
                  <div>{r.ator.nome}</div>
                  <div className="texto-muted">{rotuloDoTipoDoAtor(r.ator.tipo)}</div>
                </td>
                <td className="mono">{r.acao}</td>
                <td className="mono texto-2">{r.alvo}</td>
                <td className="texto-2">{resumirDetalhe(r.detalhe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="linha" style={{ justifyContent: "space-between" }}>
        <span className="texto-2">
          {registros.length} {registros.length === 1 ? "registro carregado" : "registros carregados"}
        </span>
        {proximaPagina !== null && !primeira.carregando ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={carregandoMais}
            onClick={() => void carregarMais()}
          >
            {carregandoMais ? "Carregando..." : "Carregar mais"}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export const AbaAuditoria = () => {
  const [ator, setAtor] = useState("");
  const [acao, setAcao] = useState("");
  const [busca, setBusca] = useState("");
  const [aplicados, setAplicados] = useState<FiltrosDeAuditoria>({});
  const [rodada, setRodada] = useState(0);

  const aoFiltrar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setAplicados({ ator: ator.trim(), acao: acao.trim(), busca: busca.trim() });
    setRodada((r) => r + 1);
  };

  const aoLimpar = (): void => {
    setAtor("");
    setAcao("");
    setBusca("");
    setAplicados({});
    setRodada((r) => r + 1);
  };

  return (
    <div className="pilha">
      <Alerta tipo="info">Registros somente de inclusão: não podem ser editados nem apagados.</Alerta>

      <form className="card" onSubmit={aoFiltrar}>
        <div className="grade-3">
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="auditoria-ator">
              Ator
            </label>
            <input
              id="auditoria-ator"
              className="input"
              placeholder="Nome ou identificador"
              value={ator}
              onChange={(e) => setAtor(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="auditoria-acao">
              Ação
            </label>
            <input
              id="auditoria-acao"
              className="input mono"
              placeholder="Ex.: sistema.cadastrado"
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
            />
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
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="linha" style={{ marginTop: "var(--esp-3)" }}>
          <button type="submit" className="btn btn-cta btn-sm">
            Filtrar
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={aoLimpar}>
            Limpar filtros
          </button>
        </div>
      </form>

      <ListaDeAuditoria key={rodada} filtros={aplicados} />
    </div>
  );
};
