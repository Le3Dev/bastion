"use client";

import type { EstadoDoAchado } from "@bastion/contratos";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { mudarEstadoDoAchado, obterAchado, revalidarAchado } from "@/api/achados";
import { mensagemDoErro } from "@/api/cliente";
import { listarMembros } from "@/api/contas";
import { TEXTO_SEM_PERMISSAO, useSessao, type Permissao } from "@/api/sessao";
import { useConsulta } from "@/api/useConsulta";
import { formatarData, formatarDataHora } from "@/apresentacao/formatacao";
import { rotuloDoEstadoDoAchado } from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { TagDeSeveridade } from "@/componentes/TagDeSeveridade";
import { FormularioDeRiscoAceito, type RiscoAceitoInformado } from "../_componentes/FormularioDeRiscoAceito";

/** Ações exibidas a partir de `transicoesPossiveis`. CORRIGIDO e REVALIDANDO nunca são oferecidos diretamente. */
const ACOES: Partial<Record<EstadoDoAchado, { rotulo: string; permissao: Permissao; perigosa?: boolean }>> = {
  CONFIRMADO: { rotulo: "Confirmar", permissao: "triarAchado" },
  EM_CORRECAO: { rotulo: "Iniciar correção", permissao: "corrigirAchado" },
  REABERTO: { rotulo: "Reabrir", permissao: "triarAchado", perigosa: true },
  RISCO_ACEITO: { rotulo: "Aceitar o risco", permissao: "aceitarRisco" },
};

const FormularioComMembros = ({
  enviando,
  aoConfirmar,
  aoCancelar,
}: {
  enviando: boolean;
  aoConfirmar: (risco: RiscoAceitoInformado) => void;
  aoCancelar: () => void;
}) => {
  const { dados, erro, carregando } = useConsulta(listarMembros);
  if (erro) {
    return (
      <div className="pilha">
        <Alerta tipo="error">{erro}</Alerta>
        <button type="button" className="btn btn-outline" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    );
  }
  if (carregando && dados === null) return <p className="texto-2">Carregando responsáveis...</p>;
  return <FormularioDeRiscoAceito membros={dados ?? []} enviando={enviando} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} />;
};

const PaginaDoAchado = () => {
  const { id } = useParams<{ id: string }>();
  const roteador = useRouter();
  const { pode } = useSessao();
  const { dados: achado, erro: erroDaConsulta, carregando, recarregar } = useConsulta((sinal) => obterAchado(id, sinal), id);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (!achado) {
    return (
      <div className="page pilha">
        {erroDaConsulta ? <Alerta tipo="error">{erroDaConsulta}</Alerta> : null}
        {carregando ? (
          <p className="texto-2" role="status">
            Carregando achado...
          </p>
        ) : (
          <EstadoVazio
            titulo="Achado não encontrado"
            descricao="O achado pode ter sido removido ou o endereço está incorreto."
            acao={
              <Link href="/achados" className="btn btn-outline">
                Voltar para achados
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const comentarioOpcional = comentario.trim() === "" ? undefined : comentario.trim();
  const acoesDoEstado = achado.transicoesPossiveis.filter((para) => ACOES[para] !== undefined);
  const podeRevalidar = achado.estado === "EM_CORRECAO";
  const semAcoes = acoesDoEstado.length === 0 && !podeRevalidar;

  const mudarEstado = async (
    para: EstadoDoAchado,
    riscoAceito?: RiscoAceitoInformado,
  ): Promise<void> => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await mudarEstadoDoAchado(achado.id, { estado: para, comentario: comentarioOpcional, riscoAceito });
      setComentario("");
      setFormularioAberto(false);
      setAviso(`Estado alterado para "${rotuloDoEstadoDoAchado(para)}".`);
      recarregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const aoClicarNaAcao = (para: EstadoDoAchado): void => {
    if (para === "RISCO_ACEITO") {
      setErro(null);
      setAviso(null);
      setFormularioAberto(true);
      return;
    }
    void mudarEstado(para);
  };

  const solicitarRevalidacao = async (): Promise<void> => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resposta = await revalidarAchado(achado.id);
      roteador.push(`/avaliacoes/${resposta.avaliacaoId}`);
    } catch (e) {
      setErro(mensagemDoErro(e));
      setOcupado(false);
    }
  };

  return (
    <div className="page pilha">
      <CabecalhoDaPagina
        titulo={achado.titulo}
        descricao={achado.sistemaNome}
        acoes={
          <div className="linha">
            <TagDeSeveridade severidade={achado.severidade} />
            <SeloDeEstado tipo="achado" estado={achado.estado} />
          </div>
        }
      />

      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {erroDaConsulta ? <Alerta tipo="error">{erroDaConsulta}</Alerta> : null}
      {aviso ? <Alerta tipo="success">{aviso}</Alerta> : null}

      <div className="card">
        <dl className="lista-definicao">
          <dt>Sistema</dt>
          <dd>{achado.sistemaNome}</dd>
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
            {achado.avaliacaoIds.map((avaliacaoId, indice) => (
              <Link key={avaliacaoId} href={`/avaliacoes/${avaliacaoId}`}>
                Avaliação {indice + 1}
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
        {semAcoes ? (
          <p className="texto-2">Nenhuma ação disponível neste estado.</p>
        ) : formularioAberto ? (
          <FormularioComMembros
            enviando={ocupado}
            aoConfirmar={(risco) => void mudarEstado("RISCO_ACEITO", risco)}
            aoCancelar={() => setFormularioAberto(false)}
          />
        ) : (
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
                disabled={ocupado}
              />
            </div>
            <div className="linha">
              {acoesDoEstado.map((para) => {
                const acao = ACOES[para];
                if (!acao) return null;
                const permitido = pode(acao.permissao);
                return (
                  <button
                    key={para}
                    type="button"
                    className={acao.perigosa ? "btn btn-danger" : "btn btn-cta"}
                    disabled={!permitido || ocupado}
                    title={permitido ? undefined : TEXTO_SEM_PERMISSAO}
                    onClick={() => aoClicarNaAcao(para)}
                  >
                    {acao.rotulo}
                  </button>
                );
              })}
              {podeRevalidar ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!pode("corrigirAchado") || ocupado}
                  title={pode("corrigirAchado") ? undefined : TEXTO_SEM_PERMISSAO}
                  onClick={() => void solicitarRevalidacao()}
                >
                  Solicitar revalidação
                </button>
              ) : null}
            </div>
            {!pode("triarAchado") && !pode("corrigirAchado") ? (
              <span className="hint">Seu papel é somente leitura</span>
            ) : null}
          </>
        )}
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
