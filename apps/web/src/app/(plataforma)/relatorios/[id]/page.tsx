"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { enderecoDoRelatorio, obterRelatorio } from "@/api/relatorios";
import { useConsulta } from "@/api/useConsulta";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { ordemDasSeveridades, rotuloDaSeveridade, rotuloDoPerfil } from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import "./impressao.css";

const PaginaDoRelatorio = () => {
  const { id } = useParams<{ id: string }>();
  const { dados: relatorio, erro, carregando } = useConsulta((sinal) => obterRelatorio(id, sinal), id);

  if (!relatorio) {
    return (
      <div className="page pilha">
        {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
        {carregando ? (
          <p className="texto-2" role="status">
            Carregando relatório...
          </p>
        ) : (
          <EstadoVazio
            titulo="Relatório não encontrado"
            descricao="O relatório pode não existir ou o endereço está incorreto."
            acao={
              <Link href="/relatorios" className="btn btn-outline">
                Ver relatórios
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const achados = [...relatorio.achados].sort(
    (a, b) => ordemDasSeveridades.indexOf(a.severidade) - ordemDasSeveridades.indexOf(b.severidade),
  );

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Relatório de segurança"
        descricao={relatorio.sistemaNome}
        acoes={
          <div className="linha sem-impressao">
            <a
              className="btn btn-cta"
              href={enderecoDoRelatorio(relatorio.id, "pdf")}
              target="_blank"
              rel="noopener noreferrer"
            >
              Baixar PDF
            </a>
            <a
              className="btn btn-outline"
              href={enderecoDoRelatorio(relatorio.id, "html")}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir HTML
            </a>
            <Link href="/relatorios" className="btn btn-outline">
              Todos os relatórios
            </Link>
          </div>
        }
      />

      <div className="card">
        <dl className="lista-definicao">
          <dt>Sistema</dt>
          <dd>{relatorio.sistemaNome}</dd>
          <dt>Avaliação</dt>
          <dd>
            <Link href={`/avaliacoes/${relatorio.avaliacaoId}`}>Ver avaliação</Link>
          </dd>
          <dt>Gerado em</dt>
          <dd>{formatarDataHora(relatorio.geradoEm)}</dd>
          <dt>Perfil</dt>
          <dd>{rotuloDoPerfil(relatorio.perfil)}</dd>
        </dl>
      </div>

      <div className="card pilha">
        <h2 className="card-titulo">Resumo</h2>
        <div className="linha">
          <NotaDeSeguranca nota={relatorio.nota} tamanho="grande" />
          <div className="pilha" style={{ gap: "var(--esp-1)" }}>
            <span className="texto-2">
              Nota mínima da avaliação: <span className="mono">{relatorio.notaMinima}</span>
            </span>
            <span className={relatorio.aprovado ? "tag tag-sucesso" : "tag tag-critica"}>
              {relatorio.aprovado ? "Aprovado" : "Reprovado"}
            </span>
          </div>
        </div>
        <p>{relatorio.resumo}</p>
        <div className="grade-4">
          {ordemDasSeveridades.map((sev) => (
            <div key={sev} className="kpi">
              <span className="kpi-rotulo">{rotuloDaSeveridade(sev)}</span>
              <span className="kpi-valor">{relatorio.contagemPorSeveridade[sev] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Achados da avaliação</h2>
        {achados.length === 0 ? (
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
              {achados.map((a) => (
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
          {(
            [
              ["OWASP", relatorio.conformidade.owasp],
              ["LGPD", relatorio.conformidade.lgpd],
            ] as const
          ).map(([titulo, itens]) => (
            <div key={titulo}>
              <h3>{titulo}</h3>
              {itens.length === 0 ? (
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
                    {itens.map((item) => (
                      <tr key={item.codigo}>
                        <td className="mono">{item.codigo}</td>
                        <td>{item.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Escopo e metodologia</h2>
        <dl className="lista-definicao">
          <dt>Perfil</dt>
          <dd>Passivo e não intrusivo: só leitura de respostas públicas, sem payloads de ataque.</dd>
          <dt>Homologação</dt>
          <dd className="mono">{relatorio.escopo.urlDeHomologacao}</dd>
          <dt>Produção</dt>
          <dd>
            <span className="mono">{relatorio.escopo.dominioDeProducao}</span> (bloqueado pelo Guardião de Escopo)
          </dd>
          <dt>Requisições permitidas</dt>
          <dd>{relatorio.escopo.requisicoesPermitidas}</dd>
          <dt>Requisições bloqueadas</dt>
          <dd>{relatorio.escopo.requisicoesBloqueadas}</dd>
        </dl>
      </div>
    </div>
  );
};

export default PaginaDoRelatorio;
