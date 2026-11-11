"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { NotaDeSeguranca } from "@/componentes/NotaDeSeguranca";
import { SeloDeEstado } from "@/componentes/SeloDeEstado";
import { verificarPropriedade } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarData } from "@/prototipo/formatacao";
import { rotuloDoTipoDeSistema } from "@/prototipo/rotulos";
import { useArmazem } from "@/prototipo/useArmazem";
import { InstrucoesDeVerificacao } from "./_componentes/InstrucoesDeVerificacao";

interface Mensagem {
  tipo: "success" | "error";
  texto: string;
}

const PaginaDeSistemas = () => {
  const estado = useArmazem();
  const [expandidos, setExpandidos] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const alternar = (id: string): void => {
    setExpandidos((atual) => (atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id]));
  };

  const verificar = (id: string, nome: string): void => {
    try {
      verificarPropriedade(id);
      setMensagem({ tipo: "success", texto: `Propriedade de "${nome}" verificada com sucesso.` });
    } catch (erro) {
      setMensagem({ tipo: "error", texto: `${nome}: ${mensagemDeErro(erro)}` });
    }
  };

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina
        titulo="Sistemas"
        descricao="Sistemas cadastrados e o estado da verificação de propriedade."
        acoes={
          <Link href="/sistemas/novo" className="btn btn-cta">
            Cadastrar sistema
          </Link>
        }
      />

      <Alerta tipo="info">
        Só avaliamos sistemas com propriedade comprovada. O domínio de produção declarado nunca é avaliado.
      </Alerta>

      <div aria-live="polite">{mensagem ? <Alerta tipo={mensagem.tipo}>{mensagem.texto}</Alerta> : null}</div>

      <div className="card">
        {estado.sistemas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum sistema cadastrado"
            descricao="Cadastre um sistema e comprove a propriedade para avaliá-lo."
            acao={
              <Link href="/sistemas/novo" className="btn btn-cta">
                Cadastrar sistema
              </Link>
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
              {estado.sistemas.map((s) => {
                const pendente = s.verificacao.estado === "PENDENTE" || s.verificacao.estado === "FALHOU";
                const aberto = expandidos.includes(s.id);
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td>{s.nome}</td>
                      <td>{rotuloDoTipoDeSistema(s.tipo)}</td>
                      <td className="mono">{s.urlDeHomologacao}</td>
                      <td>
                        <div className="mono">{s.dominioDeProducao}</div>
                        <span className="tag tag-critica">Bloqueado no Guardião</span>
                      </td>
                      <td>
                        <SeloDeEstado tipo="verificacao" estado={s.verificacao.estado} />
                      </td>
                      <td>{s.verificacao.expiraEm ? formatarData(s.verificacao.expiraEm) : "—"}</td>
                      <td>
                        <NotaDeSeguranca nota={s.ultimaNota} />
                      </td>
                      <td>
                        <div className="linha">
                          {pendente ? (
                            <>
                              <button type="button" className="btn btn-cta btn-sm" onClick={() => verificar(s.id, s.nome)}>
                                Verificar agora
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
                          {s.verificacao.estado === "VERIFICADO" ? (
                            <Link href={`/avaliacoes/nova?sistemaId=${s.id}`} className="btn btn-outline btn-sm">
                              Nova avaliação
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {pendente && aberto ? (
                      <tr>
                        <td colSpan={8}>
                          {s.verificacao.mensagem ? <Alerta tipo="error">{s.verificacao.mensagem}</Alerta> : null}
                          <InstrucoesDeVerificacao sistema={s} />
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
