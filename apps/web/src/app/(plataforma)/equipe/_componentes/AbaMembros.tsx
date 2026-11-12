"use client";

import { PAPEIS, type Papel } from "@bastion/contratos";
import { useState, type FormEvent } from "react";
import { BotaoDeConfirmacao } from "@/app/(plataforma)/integracoes/_componentes/BotaoDeConfirmacao";
import { mensagemDoErro } from "@/api/cliente";
import { alterarPapelDoMembro, convidarMembro, listarMembros, removerMembro } from "@/api/contas";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { formatarData } from "@/prototipo/formatacao";
import { rotuloDoPapel } from "@/prototipo/rotulos";

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAPEIS_ATRIBUIVEIS = PAPEIS.filter((p) => p !== "DONO");

const DESCRICAO_DOS_PAPEIS: { papel: Papel; descricao: string }[] = [
  { papel: "DONO", descricao: "Controle total: plano e cobrança, equipe, chaves de API e exclusão da organização. Há um só Dono." },
  { papel: "ADMIN", descricao: "Gerencia sistemas, equipe, integrações e chaves de API. Não altera o plano nem remove o Dono." },
  { papel: "ANALISTA", descricao: "Cadastra sistemas, solicita avaliações e trata achados (confirmar, aceitar risco, revalidar)." },
  { papel: "DESENVOLVEDOR", descricao: "Solicita avaliações e corrige achados (atualiza o estado de correção e pede revalidação)." },
  { papel: "LEITOR", descricao: "Somente leitura: consulta painel, achados e relatórios sem executar ações." },
];

export const AbaMembros = () => {
  const { pode, usuario } = useSessao();
  const podeGerenciar = pode("membros");
  const { dados, erro: erroDaLista, carregando, recarregar } = useConsulta(listarMembros);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("ANALISTA");
  const [erroDoEmail, setErroDoEmail] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [linkDoConvite, setLinkDoConvite] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const executar = async (acao: () => Promise<void>, mensagemDeSucesso?: string): Promise<void> => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
      if (mensagemDeSucesso) setAviso(mensagemDeSucesso);
      recarregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const aoConvidar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    if (!REGEX_EMAIL.test(email.trim())) {
      setErroDoEmail("Informe um e-mail válido.");
      return;
    }
    setErroDoEmail(null);
    setLinkDoConvite(null);
    setCopiado(false);
    await executar(async () => {
      const resposta = await convidarMembro({ email: email.trim(), papel });
      setLinkDoConvite(`${window.location.origin}/convite?token=${encodeURIComponent(resposta.tokenDoConvite)}`);
      setEmail("");
    }, "Convite criado. O membro aparece como Convidado até aceitar.");
  };

  const aoCopiar = async (): Promise<void> => {
    if (linkDoConvite === null) return;
    try {
      await navigator.clipboard.writeText(linkDoConvite);
      setCopiado(true);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o link e copie manualmente.");
    }
  };

  const membros = dados ?? [];

  return (
    <div className="pilha">
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {erroDaLista ? <Alerta tipo="error">{erroDaLista}</Alerta> : null}
      {aviso ? <Alerta tipo="success">{aviso}</Alerta> : null}
      {linkDoConvite ? (
        <Alerta tipo="warning">
          <div className="pilha">
            <span>
              O Bastion ainda não envia e-mails neste MVP. Copie o link e envie ao convidado; ele não será mostrado de novo.
            </span>
            <pre className="bloco-codigo">{linkDoConvite}</pre>
            <div className="linha">
              <button type="button" className="btn btn-sm" onClick={() => void aoCopiar()}>
                {copiado ? "Copiado" : "Copiar link"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinkDoConvite(null)}>
                Já copiei, fechar
              </button>
            </div>
          </div>
        </Alerta>
      ) : null}

      <div className="card">
        <h2 className="card-titulo">Membros</h2>
        {carregando && dados === null ? (
          <p className="texto-2">Carregando membros...</p>
        ) : (
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
              {membros.map((m) => {
                const rotulo = m.nome ?? m.email;
                return (
                  <tr key={m.id}>
                    <td>{m.nome ?? "—"}</td>
                    <td className="mono texto-2">{m.email}</td>
                    <td>
                      {m.papel === "DONO" ? (
                        <span className="tag tag-info-forte">{rotuloDoPapel(m.papel)}</span>
                      ) : (
                        <select
                          className="input"
                          aria-label={`Papel de ${rotulo}`}
                          value={m.papel}
                          disabled={!podeGerenciar || ocupado}
                          title={podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO}
                          onChange={(e) => {
                            const novo = PAPEIS_ATRIBUIVEIS.find((p) => p === e.target.value);
                            if (novo) {
                              void executar(
                                async () => {
                                  await alterarPapelDoMembro(m.id, { papel: novo });
                                },
                                `Papel de ${rotulo} alterado.`,
                              );
                            }
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
                      <span className={m.estado === "ATIVO" ? "tag tag-sucesso" : "tag tag-alta"}>
                        {m.estado === "ATIVO" ? "Ativo" : "Convidado"}
                      </span>
                    </td>
                    <td className="texto-2">{formatarData(m.desde)}</td>
                    <td>
                      {m.papel === "DONO" || m.email === usuario.email ? null : (
                        <BotaoDeConfirmacao
                          rotulo="Remover"
                          rotuloDeConfirmacao="Confirmar remoção"
                          aoConfirmar={() => void executar(() => removerMembro(m.id).then(() => undefined), `${rotulo} foi removido.`)}
                          desabilitado={!podeGerenciar || ocupado}
                          titulo={podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!podeGerenciar ? <p className="hint">{TEXTO_SEM_PERMISSAO}</p> : null}
      </div>

      <form className="card" onSubmit={(e) => void aoConvidar(e)} noValidate>
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
              disabled={!podeGerenciar}
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
              disabled={!podeGerenciar}
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
        <button type="submit" className="btn btn-cta" disabled={!podeGerenciar || ocupado}>
          Convidar
        </button>
        {!podeGerenciar ? <p className="hint">{TEXTO_SEM_PERMISSAO}</p> : null}
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
