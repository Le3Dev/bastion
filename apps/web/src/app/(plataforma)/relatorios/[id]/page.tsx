"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import { achadosDaAvaliacao, avaliacaoPorId, contagemPorSeveridade, relatorioPorId, sistemaPorId } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarDataHora } from "@/prototipo/formatacao";
import { ordemDasSeveridades, rotuloDaSeveridade, rotuloDoPerfil } from "@/prototipo/rotulos";
import type { Achado } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";
import "./impressao.css";

interface ItemDeConformidade {
  codigo: string;
  quantidade: number;
}

const agregarCodigos = (achados: Achado[], escolher: (a: Achado) => string[]): ItemDeConformidade[] => {
  const mapa = new Map<string, number>();
  achados.forEach((a) => {
    escolher(a).forEach((codigo) => mapa.set(codigo, (mapa.get(codigo) ?? 0) + 1));
  });
  return [...mapa.entries()]
    .map(([codigo, quantidade]) => ({ codigo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.codigo.localeCompare(b.codigo));
};

const PaginaDoRelatorio = () => {
  const { id } = useParams<{ id: string }>();
  const roteador = useRouter();
  const estado = useArmazem();
  const [erro, setErro] = useState<string | null>(null);

  const relatorio = relatorioPorId(estado, id);
  const avaliacao = relatorio ? avaliacaoPorId(estado, relatorio.avaliacaoId) : undefined;
  const sistema = relatorio ? sistemaPorId(estado, relatorio.sistemaId) : undefined;

  const detalhes = useMemo(() => {
    if (!relatorio) return null;
    const achados = achadosDaAvaliacao(estado, relatorio.avaliacaoId).sort(
      (a, b) => ordemDasSeveridades.indexOf(a.severidade) - ordemDasSeveridades.indexOf(b.severidade),
    );
    const requisicoes = avaliacao?.requisicoesDoGuardiao ?? [];
    return {
      achados,
      contagem: contagemPorSeveridade(achados),
      owasp: agregarCodigos(achados, (a) => a.conformidade.owasp),
      lgpd: agregarCodigos(achados, (a) => a.conformidade.lgpd),
      permitidas: requisicoes.filter((r) => r.decisao === "PERMITIDA").length,
      bloqueadas: requisicoes.filter((r) => r.decisao === "BLOQUEADA").length,
    };
  }, [estado, relatorio, avaliacao]);

  if (!relatorio || !detalhes) {
    return (
      <div className="page">
        <EstadoVazio
          titulo="Relatório não encontrado"
          descricao="O relatório pode não existir ou o endereço está incorreto."
          acao={
            <Link href="/avaliacoes" className="btn btn-outline">
              Ver avaliações
            </Link>
          }
        />
      </div>
    );
  }

  const aprovado = avaliacao ? relatorio.nota >= avaliacao.notaMinima : null;

  const baixarPdf = () => {
    setErro(null);
    try {
      window.print();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const exportarJson = () => {
    setErro(null);
    try {
      const conteudo = JSON.stringify({ relatorio, avaliacao: avaliacao ?? null, achados: detalhes.achados }, null, 2);
      const blob = new Blob([conteudo], { type: "application/json" });
      const endereco = URL.createObjectURL(blob);
      const ancora = document.createElement("a");
      ancora.href = endereco;
      ancora.download = `relatorio-${relatorio.id}.json`;
      document.body.appendChild(ancora);
      ancora.click();
      document.body.removeChild(ancora);
      URL.revokeObjectURL(endereco);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo={`Relatório ${relatorio.id}`}
        descricao={sistema ? `${sistema.nome}` : relatorio.sistemaId}
        acoes={
          <div className="linha sem-impressao">
            <div className="pilha" style={{ gap: "var(--esp-1)" }}>
              <button type="button" className="btn btn-cta" onClick={baixarPdf}>
                Baixar PDF
              </button>
              <span className="hint">O PDF gerado no servidor chega na Fase 2</span>
            </div>
            <button type="button" className="btn btn-outline" onClick={exportarJson}>
              Exportar JSON
            </button>
          </div>
        }
      />

      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      <div className="card sem-impressao">
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="relatorio-troca">
            Relatório
          </label>
          <select
            id="relatorio-troca"
            className="input"
            value={relatorio.id}
            onChange={(e) => roteador.push(`/relatorios/${e.target.value}`)}
          >
            {estado.relatorios.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} - {sistemaPorId(estado, r.sistemaId)?.nome ?? r.sistemaId} - {formatarDataHora(r.geradoEm)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <dl className="lista-definicao">
          <dt>Sistema</dt>
          <dd>{sistema?.nome ?? relatorio.sistemaId}</dd>
          <dt>Avaliação</dt>
          <dd>
            <Link href={`/avaliacoes/${relatorio.avaliacaoId}`} className="mono">
              {relatorio.avaliacaoId}
            </Link>
          </dd>
          <dt>Gerado em</dt>
          <dd>{formatarDataHora(relatorio.geradoEm)}</dd>
          <dt>Perfil</dt>
          <dd>{avaliacao ? rotuloDoPerfil(avaliacao.perfil) : "Não informado"}</dd>
        </dl>
      </div>

      <div className="card pilha">
        <h2 className="card-titulo">Resumo</h2>
        <div className="linha">
          <NotaDeSeguranca nota={relatorio.nota} tamanho="grande" />
          {avaliacao && aprovado !== null ? (
            <div className="pilha" style={{ gap: "var(--esp-1)" }}>
              <span className="texto-2">
                Nota mínima da avaliação: <span className="mono">{avaliacao.notaMinima}</span>
              </span>
              <span className={aprovado ? "tag tag-sucesso" : "tag tag-critica"}>{aprovado ? "Aprovado" : "Reprovado"}</span>
            </div>
          ) : null}
        </div>
        <p>{relatorio.resumo}</p>
        <div className="grade-4">
          {ordemDasSeveridades.map((sev) => (
            <div key={sev} className="kpi">
              <span className="kpi-rotulo">{rotuloDaSeveridade(sev)}</span>
              <span className="kpi-valor">{detalhes.contagem[sev]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Achados da avaliação</h2>
        {detalhes.achados.length === 0 ? (
          <EstadoVazio titulo="Nenhum achado nesta avaliação" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Título</th>
                <th>Local</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {detalhes.achados.map((a) => (
                <tr key={a.id}>
                  <td>
                    <TagDeSeveridade severidade={a.severidade} />
                  </td>
                  <td>{a.titulo}</td>
                  <td className="mono texto-2">{a.local}</td>
                  <td>
                    <SeloDeEstado tipo="achado" estado={a.estado} />
                  </td>
                  <td>
                    <Link href={`/achados/${a.id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="card-titulo">Mapeamento de conformidade</h2>
        <div className="grade-2">
          <div>
            <h3>OWASP</h3>
            {detalhes.owasp.length === 0 ? (
              <p className="texto-2">Nenhum código mapeado.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Achados</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhes.owasp.map((item) => (
                    <tr key={item.codigo}>
                      <td className="mono">{item.codigo}</td>
                      <td>{item.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3>LGPD</h3>
            {detalhes.lgpd.length === 0 ? (
              <p className="texto-2">Nenhum código mapeado.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Achados</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhes.lgpd.map((item) => (
                    <tr key={item.codigo}>
                      <td className="mono">{item.codigo}</td>
                      <td>{item.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Escopo e metodologia</h2>
        <dl className="lista-definicao">
          <dt>Perfil</dt>
          <dd>Passivo e não intrusivo: só leitura de respostas públicas, sem payloads de ataque.</dd>
          <dt>Homologação</dt>
          <dd className="mono">{sistema?.urlDeHomologacao ?? "Não informado"}</dd>
          <dt>Produção</dt>
          <dd>
            <span className="mono">{sistema?.dominioDeProducao ?? "Não informado"}</span> (bloqueado pelo Guardião de Escopo)
          </dd>
          <dt>Requisições permitidas</dt>
          <dd>{detalhes.permitidas}</dd>
          <dt>Requisições bloqueadas</dt>
          <dd>{detalhes.bloqueadas}</dd>
        </dl>
      </div>
    </div>
  );
};

export default PaginaDoRelatorio;
