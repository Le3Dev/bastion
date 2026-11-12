"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { listarSistemas, verificarPropriedade } from "@/api/sistemas";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { formatarData } from "@/apresentacao/formatacao";
import { rotuloDoTipoDeSistema } from "@/apresentacao/rotulos";
import { ConfiguracaoDoSistema } from "./_componentes/ConfiguracaoDoSistema";
import { InstrucoesDoSistema } from "./_componentes/InstrucoesDoSistema";

interface Mensagem {
  tipo: "success" | "error";
  texto: string;
}

const PaginaDeSistemas = () => {
  const { pode } = useSessao();
  const podeGerenciar = pode("sistemas");
  const { dados, erro, carregando, recarregar } = useConsulta(listarSistemas);
  const [expandidos, setExpandidos] = useState<string[]>([]);
  const [configurando, setConfigurando] = useState<string[]>([]);
  const [verificando, setVerificando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const alternar = (id: string): void => {
    setExpandidos((atual) => (atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id]));
  };

  const alternarConfiguracao = (id: string): void => {
    setConfigurando((atual) => (atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id]));
  };

  const verificar = async (id: string, nome: string): Promise<void> => {
    setMensagem(null);
    setVerificando(id);
    try {
      const resposta = await verificarPropriedade(id);
      setMensagem(
        resposta.verificado
          ? { tipo: "success", texto: `Propriedade de "${nome}" verificada com sucesso.` }
          : { tipo: "error", texto: `${nome}: ${resposta.mensagem ?? "A verificação não encontrou a prova de propriedade."}` },
      );
      recarregar();
    } catch (e) {
      setMensagem({ tipo: "error", texto: `${nome}: ${mensagemDoErro(e)}` });
    } finally {
      setVerificando(null);
    }
  };

  const sistemas = dados ?? [];

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Sistemas"
        descricao="Sistemas cadastrados e o estado da verificação de propriedade."
        acoes={
          podeGerenciar ? (
            <Link href="/sistemas/novo" className="btn btn-cta">
              Cadastrar sistema
            </Link>
          ) : (
            <button type="button" className="btn btn-cta" disabled title={TEXTO_SEM_PERMISSAO}>
              Cadastrar sistema
            </button>
          )
        }
      />

      <Alerta tipo="info">
        Só avaliamos sistemas com propriedade comprovada. O domínio de produção declarado nunca é avaliado.
      </Alerta>

      <div aria-live="polite">{mensagem ? <Alerta tipo={mensagem.tipo}>{mensagem.texto}</Alerta> : null}</div>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      <div className="card">
        {carregando && dados === null ? (
          <p className="texto-2">Carregando sistemas...</p>
        ) : sistemas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum sistema cadastrado"
            descricao="Cadastre um sistema e comprove a propriedade para avaliá-lo."
            acao={
              podeGerenciar ? (
                <Link href="/sistemas/novo" className="btn btn-cta">
                  Cadastrar sistema
                </Link>
              ) : undefined
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Homologação</th>
                <th>Produção</th>
                <th>Verificação</th>
                <th>Validade</th>
                <th>Última nota</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sistemas.map((s) => {
                const estado = s.verificacao.estado;
                const precisaVerificar = estado === null || estado === "PENDENTE" || estado === "FALHOU" || estado === "EXPIRADO";
                const aberto = expandidos.includes(s.id);
                const emVerificacao = verificando === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td>{s.nome}</td>
                      <td>{rotuloDoTipoDeSistema(s.tipo)}</td>
                      <td className="mono">{s.urlDeHomologacao}</td>
                      <td>
                        <div className="mono">{s.dominioDeProducao}</div>
                        <span className="tag tag-critica">Bloqueado pelo Guardião</span>
                      </td>
                      <td>
                        {estado ? (
                          <SeloDeEstado tipo="verificacao" estado={estado} />
                        ) : (
                          <span className="tag tag-neutra">Sem verificação</span>
                        )}
                      </td>
                      <td>{s.verificacao.expiraEm ? formatarData(s.verificacao.expiraEm) : "—"}</td>
                      <td>
                        <NotaDeSeguranca nota={s.ultimaNota} />
                      </td>
                      <td>
                        <div className="linha">
                          {precisaVerificar ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-cta btn-sm"
                                disabled={!podeGerenciar || verificando !== null}
                                title={podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO}
                                onClick={() => void verificar(s.id, s.nome)}
                              >
                                {emVerificacao ? "Verificando..." : "Verificar agora"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                aria-expanded={aberto}
                                onClick={() => alternar(s.id)}
                              >
                                {aberto ? "Ocultar instruções" : "Instruções"}
                              </button>
                            </>
                          ) : null}
                          {estado === "VERIFICADO" ? (
                            <Link href={`/avaliacoes/nova?sistemaId=${s.id}`} className="btn btn-outline btn-sm">
                              Nova avaliação
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            aria-expanded={configurando.includes(s.id)}
                            onClick={() => alternarConfiguracao(s.id)}
                          >
                            {configurando.includes(s.id) ? "Ocultar configuração" : "Configurar testes"}
                          </button>
                        </div>
                        {emVerificacao ? (
                          <span className="hint">Consultando o ambiente; pode levar até 20 segundos.</span>
                        ) : null}
                      </td>
                    </tr>
                    {precisaVerificar && aberto ? (
                      <tr>
                        <td colSpan={8}>
                          {s.verificacao.mensagem ? <Alerta tipo="error">{s.verificacao.mensagem}</Alerta> : null}
                          <InstrucoesDoSistema sistemaId={s.id} />
                        </td>
                      </tr>
                    ) : null}
                    {configurando.includes(s.id) ? (
                      <tr>
                        <td colSpan={8}>
                          <ConfiguracaoDoSistema sistema={s} podeGerenciar={podeGerenciar} aoAlterar={recarregar} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaginaDeSistemas;
