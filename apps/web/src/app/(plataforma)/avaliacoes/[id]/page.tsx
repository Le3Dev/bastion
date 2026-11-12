"use client";

import type { EstadoDaAvaliacao } from "@bastion/contratos";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { pararAvaliacao } from "@/api/avaliacoes";
import { mensagemDoErro } from "@/api/cliente";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { useAoVivo } from "@/api/useAoVivo";
import { formatarHora, formatarDataHora } from "@/apresentacao/formatacao";
import {
  ehEstadoFinalDaAvaliacao,
  rotuloDoEstadoDaAvaliacao,
  rotuloDoEstadoDaEtapa,
  rotuloDoPerfil,
} from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { BarraDeProgresso } from "@/componentes/BarraDeProgresso";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import estilos from "./ao-vivo.module.css";

const LINHA_DO_TEMPO: EstadoDaAvaliacao[] = [
  "RASCUNHO",
  "AGUARDANDO_VERIFICACAO",
  "NA_FILA",
  "PREPARANDO",
  "EM_EXECUCAO",
  "ANALISANDO",
  "CONCLUIDA",
];

const MAXIMO_DE_LINHAS_DO_LOG = 200;

const AvaliacaoAoVivo = ({ id }: { id: string }) => {
  const { pode } = useSessao();
  const { avaliacao, requisicoes, achados, erro: erroAoVivo } = useAoVivo(id);
  const [confirmandoParada, setConfirmandoParada] = useState(false);
  const [parando, setParando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoDeParada, setAvisoDeParada] = useState(false);

  if (!avaliacao) {
    return (
      <div className="page pilha">
        {erroAoVivo ? (
          <>
            <Alerta tipo="error">{erroAoVivo}</Alerta>
            <EstadoVazio
              titulo="Não foi possível carregar a avaliação"
              acao={
                <Link href="/avaliacoes" className="btn btn-outline">
                  Voltar para avaliações
                </Link>
              }
            />
          </>
        ) : (
          <p className="texto-2" role="status">
            Carregando avaliação...
          </p>
        )}
      </div>
    );
  }

  const final = ehEstadoFinalDaAvaliacao(avaliacao.estado);
  const podeParar = pode("pararAvaliacao");
  const permitidas = requisicoes.filter((r) => r.decisao === "PERMITIDA").length;
  const bloqueadas = requisicoes.length - permitidas;
  const requisicoesOrdenadas = [...requisicoes].sort((a, b) => a.em.localeCompare(b.em)).slice(-MAXIMO_DE_LINHAS_DO_LOG);

  const parar = async (): Promise<void> => {
    if (!confirmandoParada) {
      setConfirmandoParada(true);
      return;
    }
    setConfirmandoParada(false);
    setParando(true);
    setErro(null);
    try {
      await pararAvaliacao(avaliacao.id);
      setAvisoDeParada(true);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setParando(false);
    }
  };

  const terminouSemConcluir = avaliacao.estado === "FALHOU" || avaliacao.estado === "CANCELADA";
  const ultimoAlcancado = LINHA_DO_TEMPO.indexOf(avaliacao.iniciadaEm ? "PREPARANDO" : "NA_FILA");
  const etapasDaLinha: EstadoDaAvaliacao[] = terminouSemConcluir
    ? [...LINHA_DO_TEMPO.slice(0, ultimoAlcancado + 1), avaliacao.estado]
    : LINHA_DO_TEMPO;
  const indiceAtual = etapasDaLinha.indexOf(avaliacao.estado);
  const aprovada = avaliacao.aprovada ?? (avaliacao.nota !== null && avaliacao.nota >= avaliacao.notaMinima);

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Avaliação"
        descricao={`${avaliacao.sistemaNome} · perfil ${rotuloDoPerfil(avaliacao.perfil)} · origem ${avaliacao.origem}`}
        acoes={
          <Link href="/avaliacoes" className="btn btn-outline">
            Todas as avaliações
          </Link>
        }
      />

      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {erroAoVivo ? <Alerta tipo="warning">{erroAoVivo}</Alerta> : null}
      {avisoDeParada && !final ? <Alerta tipo="info">Parada solicitada. Aguardando o encerramento da avaliação.</Alerta> : null}

      {avaliacao.estado === "AGUARDANDO_VERIFICACAO" ? (
        <Alerta tipo="warning">
          A propriedade do sistema ainda não foi verificada, então a avaliação não pode começar.{" "}
          <Link href="/sistemas">Verifique o sistema em Sistemas</Link>.
        </Alerta>
      ) : null}

      <div className="card pilha">
        <div className={estilos.cabecalho}>
          <div className="pilha">
            <div className="linha">
              <SeloDeEstado tipo="avaliacao" estado={avaliacao.estado} />
              <span className="texto-2">Solicitada em {formatarDataHora(avaliacao.solicitadaEm)}</span>
            </div>
          </div>
          {!final ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={!podeParar || parando}
              title={podeParar ? undefined : TEXTO_SEM_PERMISSAO}
              onClick={() => void parar()}
              onBlur={() => setConfirmandoParada(false)}
            >
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
            const concluido = !atual && i < indiceAtual;
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
        {avaliacao.etapas.length === 0 ? (
          <EstadoVazio titulo="As etapas aparecem quando a avaliação começar" />
        ) : (
          <div className="pilha" aria-live="polite">
            {[...avaliacao.etapas]
              .sort((a, b) => a.ordem - b.ordem)
              .map((et) => (
                <div key={et.ordem} className={estilos.etapa}>
                  <span>{et.nome}</span>
                  <span className="texto-2">{rotuloDoEstadoDaEtapa(et.estado)}</span>
                  <BarraDeProgresso valor={et.progresso} />
                </div>
              ))}
          </div>
        )}
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
        {requisicoesOrdenadas.length === 0 ? (
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
              {requisicoesOrdenadas.map((r) => (
                <tr key={r.id} className={r.decisao === "BLOQUEADA" ? estilos.linhaBloqueada : undefined}>
                  <td>{formatarHora(r.em)}</td>
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
            <Alerta tipo="success">Avaliação aprovada: a nota atingiu a mínima exigida.</Alerta>
          ) : (
            <Alerta tipo="warning">Avaliação reprovada: a nota ficou abaixo da mínima e reprova o pipeline de CI.</Alerta>
          )}
          {avaliacao.relatorioId ? (
            <div>
              <Link href={`/relatorios/${avaliacao.relatorioId}`} className="btn btn-cta">
                Ver relatório
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {avaliacao.estado === "FALHOU" ? <Alerta tipo="error">{avaliacao.motivoDaFalha ?? "A avaliação falhou."}</Alerta> : null}

      {avaliacao.estado === "CANCELADA" ? <Alerta tipo="warning">Avaliação cancelada.</Alerta> : null}
    </div>
  );
};

const PaginaDaAvaliacaoAoVivo = () => {
  const { id } = useParams<{ id: string }>();
  return <AvaliacaoAoVivo key={id} id={id} />;
};

export default PaginaDaAvaliacaoAoVivo;
