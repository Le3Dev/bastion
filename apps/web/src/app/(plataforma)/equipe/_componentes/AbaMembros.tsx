"use client";

import { useState, type FormEvent } from "react";
import { Alerta } from "@/componentes/Alerta";
import { BotaoDeConfirmacao } from "@/app/(plataforma)/integracoes/_componentes/BotaoDeConfirmacao";
import { alterarPapelDoMembro, convidarMembro, removerMembro } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarData } from "@/prototipo/formatacao";
import { papeisDisponiveis, rotuloDoPapel } from "@/prototipo/rotulos";
import type { Membro, Papel } from "@/prototipo/tipos";

interface PropsDaAba {
  membros: Membro[];
  somenteLeitura: boolean;
}

const TEXTO_SOMENTE_LEITURA = "Seu papel é somente leitura";
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAPEIS_ATRIBUIVEIS = papeisDisponiveis.filter((p) => p !== "DONO");

const DESCRICAO_DOS_PAPEIS: { papel: Papel; descricao: string }[] = [
  { papel: "DONO", descricao: "Controle total: plano e cobrança, equipe, chaves de API e exclusão da organização. Há um só Dono." },
  { papel: "ADMIN", descricao: "Gerencia sistemas, equipe, integrações e chaves de API. Não altera o plano nem remove o Dono." },
  { papel: "ANALISTA", descricao: "Cadastra sistemas, solicita avaliações e trata achados (confirmar, aceitar risco, revalidar)." },
  { papel: "DESENVOLVEDOR", descricao: "Vê achados e relatórios, atualiza o estado de correção e solicita revalidação." },
  { papel: "LEITOR", descricao: "Somente leitura: consulta painel, achados e relatórios sem executar ações." },
];

export const AbaMembros = ({ membros, somenteLeitura }: PropsDaAba) => {
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("ANALISTA");
  const [erroDoEmail, setErroDoEmail] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const executar = (acao: () => void, mensagemDeSucesso?: string) => {
    setErro(null);
    setAviso(null);
    try {
      acao();
      if (mensagemDeSucesso) setAviso(mensagemDeSucesso);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const aoConvidar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!REGEX_EMAIL.test(email.trim())) {
      setErroDoEmail("Informe um e-mail válido.");
      return;
    }
    setErroDoEmail(null);
    executar(() => {
      convidarMembro(email, papel);
      setEmail("");
    }, "Convite registrado. O membro aparece como Convidado até aceitar.");
  };

  return (
    <div className="pilha">
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {aviso ? <Alerta tipo="success">{aviso}</Alerta> : null}

      <div className="card">
        <h2 className="card-titulo">Membros</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Estado</th>
              <th>Desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td>
                <td className="mono texto-2">{m.email}</td>
                <td>
                  {m.papel === "DONO" ? (
                    <span className="tag tag-info-forte">{rotuloDoPapel(m.papel)}</span>
                  ) : (
                    <select
                      className="input"
                      aria-label={`Papel de ${m.nome}`}
                      value={m.papel}
                      disabled={somenteLeitura}
                      title={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined}
                      onChange={(e) => {
                        const novo = PAPEIS_ATRIBUIVEIS.find((p) => p === e.target.value);
                        if (novo) executar(() => alterarPapelDoMembro(m.id, novo), `Papel de ${m.nome} alterado.`);
                      }}
                    >
                      {PAPEIS_ATRIBUIVEIS.map((p) => (
                        <option key={p} value={p}>
                          {rotuloDoPapel(p)}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <span className={m.estado === "ATIVO" ? "tag tag-sucesso" : "tag tag-alta"}>{m.estado}</span>
                </td>
                <td className="texto-2">{formatarData(m.desde)}</td>
                <td>
                  {m.papel === "DONO" ? null : (
                    <BotaoDeConfirmacao
                      rotulo="Remover"
                      rotuloDeConfirmacao="Confirmar remoção"
                      aoConfirmar={() => executar(() => removerMembro(m.id), `${m.nome} foi removido.`)}
                      desabilitado={somenteLeitura}
                      titulo={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {somenteLeitura ? <p className="hint">{TEXTO_SOMENTE_LEITURA}</p> : null}
      </div>

      <form className="card" onSubmit={aoConvidar} noValidate>
        <h2 className="card-titulo">Convidar membro</h2>
        <div className="grade-2">
          <div className="field">
            <label className="label" htmlFor="convite-email">
              E-mail
            </label>
            <input
              id="convite-email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={somenteLeitura}
              aria-invalid={erroDoEmail !== null}
            />
            {erroDoEmail ? <span className="erro-campo">{erroDoEmail}</span> : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="convite-papel">
              Papel
            </label>
            <select
              id="convite-papel"
              className="input"
              value={papel}
              disabled={somenteLeitura}
              onChange={(e) => setPapel(PAPEIS_ATRIBUIVEIS.find((p) => p === e.target.value) ?? "ANALISTA")}
            >
              {PAPEIS_ATRIBUIVEIS.map((p) => (
                <option key={p} value={p}>
                  {rotuloDoPapel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-cta" disabled={somenteLeitura}>
          Convidar
        </button>
        {somenteLeitura ? <p className="hint">{TEXTO_SOMENTE_LEITURA}</p> : null}
      </form>

      <div className="card">
        <h2 className="card-titulo">O que cada papel pode fazer</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Papel</th>
              <th>Permissões</th>
            </tr>
          </thead>
          <tbody>
            {DESCRICAO_DOS_PAPEIS.map((d) => (
              <tr key={d.papel}>
                <td>
                  <strong>{rotuloDoPapel(d.papel)}</strong>
                </td>
                <td className="texto-2">{d.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
