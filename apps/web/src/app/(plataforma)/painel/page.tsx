"use client";

import Link from "next/link";
import { obterPainel } from "@/api/painel";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { useConsulta } from "@/api/useConsulta";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { ordemDasSeveridades, rotuloDaSeveridade } from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";

const PaginaDoPainel = () => {
  const { pode } = useSessao();
  const { dados, erro, carregando } = useConsulta(obterPainel);

  const podeSolicitar = pode("solicitarAvaliacao");
  const acaoPrincipal = podeSolicitar ? (
    <Link href="/avaliacoes/nova" className="btn btn-cta">
      Nova avaliação
    </Link>
  ) : (
    <button type="button" className="btn btn-cta" disabled title={TEXTO_SEM_PERMISSAO}>
      Nova avaliação
    </button>
  );

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Painel"
      descricao="Visão geral da segurança dos sistemas da organização."
      acoes={acaoPrincipal}
    />
  );

  if (dados === null) {
    return (
      <div className="page-wide pilha">
        {cabecalho}
        {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
        {carregando ? <p className="texto-2">Carregando painel...</p> : null}
      </div>
    );
  }

  const totalDeSistemas = dados.sistemas.verificados + dados.sistemas.pendentes;
  const totalAbertos = ordemDasSeveridades.reduce((soma, sev) => soma + (dados.achadosEmAbertoPorSeveridade[sev] ?? 0), 0);

  if (totalDeSistemas === 0 && dados.avaliacoesRecentes.length === 0) {
    return (
      <div className="page-wide pilha">
        {cabecalho}
        {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
        <div className="card">
          <EstadoVazio
            titulo="Sua organização ainda não tem sistemas"
            descricao="Cadastre um sistema, comprove a propriedade e solicite a primeira avaliação."
            acao={
              <Link href="/sistemas/novo" className="btn btn-cta">
                Cadastrar sistema
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wide pilha">
      {cabecalho}
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      <div className="grade-4">
        <div className="card kpi">
          <span className="kpi-rotulo">Nota média dos sistemas</span>
          <NotaDeSeguranca nota={dados.notaMedia === null ? null : Math.round(dados.notaMedia)} tamanho="grande" />
        </div>
        <div className="card kpi">
          <span className="kpi-rotulo">Achados em aberto</span>
          <span className="kpi-valor">{totalAbertos}</span>
          <div className="linha">
            {ordemDasSeveridades.map((sev) => (
              <span key={sev} className="texto-2">
                {rotuloDaSeveridade(sev)}: <span className="mono">{dados.achadosEmAbertoPorSeveridade[sev] ?? 0}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="card kpi">
          <span className="kpi-rotulo">Sistemas verificados × pendentes</span>
          <span className="kpi-valor">
            {dados.sistemas.verificados} × {dados.sistemas.pendentes}
          </span>
          {dados.sistemas.pendentes > 0 ? <Link href="/sistemas">Ver sistemas</Link> : null}
        </div>
        <div className="card kpi">
          <span className="kpi-rotulo">Avaliações em andamento</span>
          <span className="kpi-valor">{dados.avaliacoesEmAndamento}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Avaliações recentes</h2>
        {dados.avaliacoesRecentes.length === 0 ? (
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
              {dados.avaliacoesRecentes.map((a) => (
                <tr key={a.id}>
                  <td>{a.sistemaNome}</td>
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

      <div className="card">
        <h2 className="card-titulo">Achados críticos e altos em aberto</h2>
        {dados.achadosCriticosEAltos.length === 0 ? (
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
              {dados.achadosCriticosEAltos.map((a) => (
                <tr key={a.id}>
                  <td>
                    <TagDeSeveridade severidade={a.severidade} />
                  </td>
                  <td>
                    <Link href={`/achados/${a.id}`}>{a.titulo}</Link>
                  </td>
                  <td className="texto-2">{a.sistemaNome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaginaDoPainel;
