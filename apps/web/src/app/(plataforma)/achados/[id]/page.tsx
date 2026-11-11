"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import {
  achadoPorId,
  concluirRevalidacao,
  mudarEstadoDoAchado,
  revalidarAchado,
  sistemaPorId,
} from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarData, formatarDataHora } from "@/prototipo/formatacao";
import { transicoesPossiveisDoAchado } from "@/prototipo/maquinas-de-estado";
import { rotuloDoEstadoDoAchado } from "@/prototipo/rotulos";
import type { EstadoDoAchado, RiscoAceito } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";
import { FormularioDeRiscoAceito } from "../_componentes/FormularioDeRiscoAceito";

const ATRASO_DA_REVALIDACAO_MS = 2500;
const TEXTO_SOMENTE_LEITURA = "Seu papel é somente leitura";

const rotuloDaAcao = (de: EstadoDoAchado, para: EstadoDoAchado): string => {
  switch (para) {
    case "CONFIRMADO":
      return de === "NOVO" ? "Confirmar achado" : "Retomar como confirmado";
    case "EM_CORRECAO":
      return "Iniciar correção";
    case "REVALIDANDO":
      return "Solicitar revalidação";
    case "REABERTO":
      return "Reabrir";
    case "RISCO_ACEITO":
      return "Aceitar o risco";
    case "CORRIGIDO":
      return "Simular conclusão da revalidação";
    default:
      return rotuloDoEstadoDoAchado(para);
  }
};

const PaginaDoAchado = () => {
  const { id } = useParams<{ id: string }>();
  const estado = useArmazem();
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [revalidando, setRevalidando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current !== null) clearTimeout(temporizador.current);
    },
    [],
  );

  const achado = achadoPorId(estado, id);

  if (!achado) {
    return (
      <div className="page">
        <EstadoVazio
          titulo="Achado não encontrado"
          descricao="O achado pode ter sido removido ou o endereço está incorreto."
          acao={
            <Link href="/achados" className="btn btn-outline">
              Voltar para achados
            </Link>
          }
        />
      </div>
    );
  }

  const somenteLeitura = estado.usuarioAtual?.papel === "LEITOR";
  const sistema = sistemaPorId(estado, achado.sistemaId);
  const transicoes = transicoesPossiveisDoAchado(achado.estado);
  const comentarioOpcional = comentario.trim() === "" ? undefined : comentario;

  const executar = (acao: () => void, mensagemDeSucesso: string) => {
    setErro(null);
    setAviso(null);
    try {
      acao();
      setComentario("");
      setAviso(mensagemDeSucesso);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const aoMudarEstado = (para: EstadoDoAchado) => {
    if (para === "RISCO_ACEITO") {
      setErro(null);
      setAviso(null);
      setFormularioAberto(true);
      return;
    }
    if (para === "CORRIGIDO") {
      executar(() => {
        concluirRevalidacao(achado.id);
      }, "Revalidação concluída: o achado foi marcado como corrigido.");
      return;
    }
    if (para === "REVALIDANDO") {
      setErro(null);
      setAviso(null);
      try {
        revalidarAchado(achado.id);
      } catch (e) {
        setErro(mensagemDeErro(e));
        return;
      }
      setRevalidando(true);
      temporizador.current = setTimeout(() => {
        temporizador.current = null;
        setRevalidando(false);
        try {
          concluirRevalidacao(achado.id);
          setAviso("Revalidação concluída: o achado foi marcado como corrigido.");
        } catch (e) {
          setErro(mensagemDeErro(e));
        }
      }, ATRASO_DA_REVALIDACAO_MS);
      return;
    }
    executar(() => {
      mudarEstadoDoAchado(achado.id, para, { comentario: comentarioOpcional });
    }, `Estado alterado para "${rotuloDoEstadoDoAchado(para)}".`);
  };

  const aoAceitarRisco = (riscoAceito: RiscoAceito) => {
    executar(() => {
      mudarEstadoDoAchado(achado.id, "RISCO_ACEITO", { comentario: comentarioOpcional, riscoAceito });
      setFormularioAberto(false);
    }, "Risco aceito registrado.");
  };

  const emAndamento = revalidando && achado.estado === "REVALIDANDO";

  return (
    <div className="page pilha">
      <CabecalhoDaPagina
        titulo={achado.titulo}
        descricao={sistema?.nome}
        acoes={
          <div className="linha">
            <TagDeSeveridade severidade={achado.severidade} />
            <SeloDeEstado tipo="achado" estado={achado.estado} />
          </div>
        }
      />

      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {aviso ? <Alerta tipo="success">{aviso}</Alerta> : null}

      <div className="card">
        <dl className="lista-definicao">
          <dt>Sistema</dt>
          <dd>{sistema?.nome ?? achado.sistemaId}</dd>
          <dt>Tipo</dt>
          <dd>{achado.tipo}</dd>
          <dt>Local</dt>
          <dd className="mono">{achado.local}</dd>
          <dt>Impressão digital</dt>
          <dd className="mono">{achado.impressaoDigital}</dd>
          <dt>Ocorrências</dt>
          <dd>{achado.ocorrencias}×</dd>
          <dt>Primeira vez</dt>
          <dd>{formatarDataHora(achado.primeiraVezEm)}</dd>
          <dt>Última vez</dt>
          <dd>{formatarDataHora(achado.ultimaVezEm)}</dd>
          <dt>Avaliações</dt>
          <dd className="linha">
            {achado.avaliacaoIds.map((avaliacaoId) => (
              <Link key={avaliacaoId} href={`/avaliacoes/${avaliacaoId}`} className="mono">
                {avaliacaoId}
              </Link>
            ))}
          </dd>
        </dl>
      </div>

      {achado.estado === "RISCO_ACEITO" && achado.riscoAceito ? (
        <div className="card">
          <h2 className="card-titulo">Risco aceito vigente</h2>
          <dl className="lista-definicao">
            <dt>Justificativa</dt>
            <dd>{achado.riscoAceito.justificativa}</dd>
            <dt>Responsável</dt>
            <dd>{achado.riscoAceito.responsavel}</dd>
            <dt>Válido até</dt>
            <dd>{formatarData(achado.riscoAceito.validoAte)}</dd>
          </dl>
          <div style={{ marginTop: "var(--esp-3)" }}>
            <Alerta tipo="warning">Ao vencer, o achado volta para Confirmado.</Alerta>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2 className="card-titulo">Descrição</h2>
        <p>{achado.descricao}</p>
      </div>

      <div className="card pilha">
        <h2 className="card-titulo">Evidência</h2>
        <div>
          <span className="label">Requisição</span>
          <pre className="bloco-codigo">{achado.evidencia.requisicao}</pre>
        </div>
        <div>
          <span className="label">Resposta</span>
          <pre className="bloco-codigo">{achado.evidencia.resposta}</pre>
        </div>
        <p className="texto-2">{achado.evidencia.observacao}</p>
      </div>

      <div className="card">
        <h2 className="card-titulo">Correção sugerida</h2>
        <pre className="bloco-codigo">{achado.correcaoSugerida}</pre>
      </div>

      <div className="card pilha">
        <h2 className="card-titulo">Conformidade</h2>
        <div className="linha">
          <span className="label">OWASP</span>
          {achado.conformidade.owasp.length === 0 ? <span className="texto-muted">Nenhum</span> : null}
          {achado.conformidade.owasp.map((codigo) => (
            <span key={codigo} className="tag tag-info-forte">
              {codigo}
            </span>
          ))}
        </div>
        <div className="linha">
          <span className="label">LGPD</span>
          {achado.conformidade.lgpd.length === 0 ? <span className="texto-muted">Nenhum</span> : null}
          {achado.conformidade.lgpd.map((codigo) => (
            <span key={codigo} className="tag tag-neutra">
              {codigo}
            </span>
          ))}
        </div>
      </div>

      <div className="card pilha">
        <h2 className="card-titulo">Ações</h2>
        {transicoes.length === 0 ? (
          <p className="texto-2">Nenhuma ação disponível neste estado.</p>
        ) : formularioAberto ? null : (
          <>
            <div className="field">
              <label className="label" htmlFor="achado-comentario">
                Comentário (opcional)
              </label>
              <textarea
                id="achado-comentario"
                className="input"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                disabled={somenteLeitura || emAndamento}
              />
            </div>
            {emAndamento ? <Alerta tipo="info">Revalidando o achado no sistema... aguarde alguns segundos.</Alerta> : null}
            <div className="linha">
              {transicoes.map((para) => (
                <button
                  key={para}
                  type="button"
                  className={para === "REABERTO" ? "btn btn-danger" : "btn btn-cta"}
                  disabled={somenteLeitura || emAndamento}
                  onClick={() => aoMudarEstado(para)}
                >
                  {rotuloDaAcao(achado.estado, para)}
                </button>
              ))}
            </div>
            {somenteLeitura ? <span className="hint">{TEXTO_SOMENTE_LEITURA}</span> : null}
          </>
        )}
        {formularioAberto ? (
          <FormularioDeRiscoAceito
            membros={estado.membros}
            aoConfirmar={aoAceitarRisco}
            aoCancelar={() => setFormularioAberto(false)}
          />
        ) : null}
      </div>

      <div className="card">
        <h2 className="card-titulo">Histórico</h2>
        {achado.historico.length === 0 ? (
          <p className="texto-2">Sem movimentações.</p>
        ) : (
          <ol className="pilha" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {achado.historico.map((h, indice) => (
              <li key={`${h.em}-${indice}`}>
                <div className="linha">
                  <span className="mono texto-muted">{formatarDataHora(h.em)}</span>
                  <span>
                    {h.de ? rotuloDoEstadoDoAchado(h.de) : "Criação"} → <strong>{rotuloDoEstadoDoAchado(h.para)}</strong>
                  </span>
                  <span className="texto-2">por {h.ator}</span>
                </div>
                {h.comentario ? <p className="texto-2">{h.comentario}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <Link href="/achados" className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
        Voltar para achados
      </Link>
    </div>
  );
};

export default PaginaDoAchado;
