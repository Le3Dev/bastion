"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alerta } from "@/componentes/Alerta";
import { BarraDeProgresso } from "@/componentes/BarraDeProgresso";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import {
  achadosDaAvaliacao,
  avaliacaoPorId,
  avancarSimulacao,
  pararAvaliacao,
  relatorioDaAvaliacao,
  sistemaPorId,
} from "@/prototipo/armazem";
import { NOMES_DAS_ETAPAS } from "@/prototipo/dados-ficticios/avaliacoes";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarDataHora } from "@/prototipo/formatacao";
import { ehEstadoFinalDaAvaliacao } from "@/prototipo/maquinas-de-estado";
import { rotuloDoEstadoDaAvaliacao, rotuloDoPerfil } from "@/prototipo/rotulos";
import type { EstadoDaAvaliacao, EstadoDaEtapa } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";
import estilos from "./ao-vivo.module.css";

const INTERVALO_DA_SIMULACAO_MS = 700;

const LINHA_DO_TEMPO: EstadoDaAvaliacao[] = [
  "RASCUNHO",
  "AGUARDANDO_VERIFICACAO",
  "NA_FILA",
  "PREPARANDO",
  "EM_EXECUCAO",
  "ANALISANDO",
  "CONCLUIDA",
];

const ROTULO_DA_ETAPA: Record<EstadoDaEtapa, string> = {
  PENDENTE: "Pendente",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  FALHOU: "Falhou",
  IGNORADA: "Ignorada",
};

const PaginaDaAvaliacaoAoVivo = () => {
  const { id } = useParams<{ id: string }>();
  const estado = useArmazem();
  const [confirmandoParada, setConfirmandoParada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const avaliacao = avaliacaoPorId(estado, id);
  const final = avaliacao ? ehEstadoFinalDaAvaliacao(avaliacao.estado) : true;
  const existe = avaliacao !== undefined;

  useEffect(() => {
    if (!existe || final) return undefined;
    const intervalo = window.setInterval(() => {
      try {
        avancarSimulacao(id);
      } catch (e) {
        setErro(mensagemDeErro(e));
        window.clearInterval(intervalo);
      }
    }, INTERVALO_DA_SIMULACAO_MS);
    return () => window.clearInterval(intervalo);
  }, [id, existe, final]);

  const derivados = useMemo(() => {
    if (!avaliacao) return null;
    const permitidas = avaliacao.requisicoesDoGuardiao.filter((r) => r.decisao === "PERMITIDA").length;
    return {
      sistema: sistemaPorId(estado, avaliacao.sistemaId),
      achados: achadosDaAvaliacao(estado, avaliacao.id),
      relatorio: relatorioDaAvaliacao(estado, avaliacao.id),
      permitidas,
      bloqueadas: avaliacao.requisicoesDoGuardiao.length - permitidas,
    };
  }, [estado, avaliacao]);

  if (!avaliacao || !derivados) {
    return (
      <div className="page">
        <EstadoVazio
          titulo="Avaliação não encontrada"
          descricao="O identificador informado não corresponde a nenhuma avaliação."
          acao={
            <Link href="/avaliacoes" className="btn btn-outline">
              Voltar para avaliações
            </Link>
          }
        />
      </div>
    );
  }

  const { sistema, achados, relatorio, permitidas, bloqueadas } = derivados;

  const parar = (): void => {
    if (!confirmandoParada) {
      setConfirmandoParada(true);
      return;
    }
    try {
      pararAvaliacao(avaliacao.id);
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setConfirmandoParada(false);
    }
  };

  const terminouComFalhaOuCancelamento = avaliacao.estado === "FALHOU" || avaliacao.estado === "CANCELADA";
  const indiceAtual = LINHA_DO_TEMPO.indexOf(avaliacao.estado);
  const alcancado = terminouComFalhaOuCancelamento
    ? LINHA_DO_TEMPO.indexOf(avaliacao.iniciadaEm ? "PREPARANDO" : "NA_FILA")
    : indiceAtual;
  const etapasDaLinha: EstadoDaAvaliacao[] = terminouComFalhaOuCancelamento
    ? [...LINHA_DO_TEMPO.slice(0, alcancado + 1), avaliacao.estado]
    : LINHA_DO_TEMPO;

  const aprovada = avaliacao.nota !== null && avaliacao.nota >= avaliacao.notaMinima;

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Avaliação"
        descricao={`${sistema?.nome ?? avaliacao.sistemaId} · perfil ${rotuloDoPerfil(avaliacao.perfil)} · origem ${avaliacao.origem}`}
        acoes={
          <Link href="/avaliacoes" className="btn btn-outline">
            Todas as avaliações
          </Link>
        }
      />

      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      <div className="card pilha">
        <div className={estilos.cabecalho}>
          <div className="pilha">
            <div className="linha">
              <SeloDeEstado tipo="avaliacao" estado={avaliacao.estado} />
              <span className="texto-2">Solicitada em {formatarDataHora(avaliacao.solicitadaEm)}</span>
            </div>
          </div>
          {!final ? (
            <button type="button" className="btn btn-danger" onClick={parar}>
              {confirmandoParada ? "Confirmar parada" : "Parar avaliação"}
            </button>
          ) : null}
        </div>
        <div aria-live="polite">
          <BarraDeProgresso valor={avaliacao.progresso} rotulo="Progresso geral" />
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Linha do tempo dos estados</h2>
        <ol className="passos">
          {etapasDaLinha.map((e, i) => {
            const atual = e === avaliacao.estado;
            const concluido = !atual && i < etapasDaLinha.indexOf(avaliacao.estado);
            return (
              <li
                key={e}
                className={`passo ${atual ? "passo-ativo" : ""} ${concluido ? "passo-concluido" : ""}`}
                aria-current={atual ? "step" : undefined}
              >
                {rotuloDoEstadoDaAvaliacao(e)}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="card">
        <h2 className="card-titulo">Etapas</h2>
        <div className="pilha" aria-live="polite">
          {avaliacao.etapas.map((et, i) => (
            <div key={et.id} className={estilos.etapa}>
              <span>{NOMES_DAS_ETAPAS[i] ?? et.nome}</span>
              <span className="texto-2">{ROTULO_DA_ETAPA[et.estado]}</span>
              <BarraDeProgresso valor={et.progresso} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="card-titulo">Log do Guardião de Escopo</h2>
        <div className={estilos.contadores}>
          <span>
            Permitidas: <span className="mono tag tag-sucesso">{permitidas}</span>
          </span>
          <span>
            Bloqueadas: <span className="mono tag tag-critica">{bloqueadas}</span>
          </span>
        </div>
        {avaliacao.requisicoesDoGuardiao.length === 0 ? (
          <EstadoVazio titulo="Nenhuma requisição registrada ainda" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Método</th>
                <th>URL</th>
                <th>Decisão</th>
                <th>Motivo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {avaliacao.requisicoesDoGuardiao.map((r) => (
                <tr key={r.id} className={r.decisao === "BLOQUEADA" ? estilos.linhaBloqueada : undefined}>
                  <td>{formatarDataHora(r.em)}</td>
                  <td className="mono">{r.metodo}</td>
                  <td className="mono">{r.url}</td>
                  <td>
                    <span className={`tag ${r.decisao === "PERMITIDA" ? "tag-sucesso" : "tag-critica"}`}>
                      {r.decisao === "PERMITIDA" ? "Permitida" : "Bloqueada"}
                    </span>
                  </td>
                  <td className="texto-2">{r.motivo}</td>
                  <td className="mono">{r.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="card-titulo">Achados encontrados até agora</h2>
        {achados.length === 0 ? (
          <EstadoVazio titulo="Nenhum achado até o momento" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Achado</th>
                <th>Ocorrências</th>
              </tr>
            </thead>
            <tbody>
              {achados.map((a) => (
                <tr key={a.id}>
                  <td>
                    <TagDeSeveridade severidade={a.severidade} />
                  </td>
                  <td>
                    <Link href={`/achados/${a.id}`}>{a.titulo}</Link>
                  </td>
                  <td className="mono">{a.ocorrencias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {avaliacao.estado === "CONCLUIDA" ? (
        <div className="card pilha">
          <h2 className="card-titulo">Resultado</h2>
          <div className={estilos.notaFinal}>
            <NotaDeSeguranca nota={avaliacao.nota} tamanho="grande" />
            <span className="texto-2">
              Nota mínima exigida: <span className="mono">{avaliacao.notaMinima}</span>
            </span>
          </div>
          {aprovada ? (
            <Alerta tipo="success">A nota atingiu a mínima: a avaliação passou no critério do pipeline de CI.</Alerta>
          ) : (
            <Alerta tipo="warning">A nota ficou abaixo da mínima: a avaliação reprova o pipeline de CI.</Alerta>
          )}
          {relatorio ? (
            <div>
              <Link href={`/relatorios/${relatorio.id}`} className="btn btn-cta">
                Ver relatório
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {avaliacao.estado === "FALHOU" ? (
        <Alerta tipo="error">{avaliacao.motivoDaFalha ?? "A avaliação falhou."}</Alerta>
      ) : null}

      {avaliacao.estado === "CANCELADA" ? <Alerta tipo="warning">Avaliação cancelada.</Alerta> : null}
    </div>
  );
};

export default PaginaDaAvaliacaoAoVivo;
