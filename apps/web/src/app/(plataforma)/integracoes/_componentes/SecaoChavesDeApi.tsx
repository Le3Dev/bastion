"use client";

import { PAPEIS, type Papel } from "@bastion/contratos";
import { useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { criarChaveDeApi, listarChavesDeApi, revogarChaveDeApi } from "@/api/contas";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { Icone } from "@/componentes/Icone";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { rotuloDoPapel } from "@/apresentacao/rotulos";
import { BotaoDeConfirmacao } from "./BotaoDeConfirmacao";

const PAPEIS_DA_CHAVE = PAPEIS.filter((p) => p !== "DONO");

export const SecaoChavesDeApi = () => {
  const { pode } = useSessao();
  const podeGerenciar = pode("chaves");
  const { dados, erro: erroDaLista, carregando, recarregar } = useConsulta(listarChavesDeApi);
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("DESENVOLVEDOR");
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const aoCriar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setErro(null);
    setCopiado(false);
    if (nome.trim().length < 2) {
      setErroDoCampo("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    setErroDoCampo(null);
    setOcupado(true);
    try {
      const resposta = await criarChaveDeApi({ nome: nome.trim(), papel });
      setSegredo(resposta.segredo);
      setNome("");
      recarregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const aoCopiar = async (): Promise<void> => {
    if (segredo === null) return;
    setErro(null);
    try {
      await navigator.clipboard.writeText(segredo);
      setCopiado(true);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  };

  const aoRevogar = async (id: string): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      await revogarChaveDeApi(id);
      recarregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const chaves = dados ?? [];

  return (
    <div className="card pilha">
      <h2 className="card-titulo">Chaves de API</h2>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {erroDaLista ? <Alerta tipo="error">{erroDaLista}</Alerta> : null}
      {segredo ? (
        <Alerta tipo="warning">
          <div className="pilha">
            <span>Copie agora; ele não será mostrado de novo.</span>
            <pre className="bloco-codigo">{segredo}</pre>
            <div className="linha">
              <button type="button" className="btn btn-sm" onClick={() => void aoCopiar()}>
                <Icone nome="copiar" tamanho={14} />
                {copiado ? "Copiado" : "Copiar"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSegredo(null)}>
                Já copiei, fechar
              </button>
            </div>
          </div>
        </Alerta>
      ) : null}

      {carregando && dados === null ? (
        <p className="texto-2">Carregando chaves...</p>
      ) : chaves.length === 0 ? (
        <EstadoVazio titulo="Nenhuma chave de API" descricao="Crie uma chave para usar a API no seu pipeline de CI." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Prefixo</th>
              <th>Papel</th>
              <th>Criada</th>
              <th>Último uso</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {chaves.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td className="mono">{c.prefixo}…</td>
                <td>{rotuloDoPapel(c.papel)}</td>
                <td className="texto-2">{formatarDataHora(c.criadaEm)}</td>
                <td className="texto-2">{c.ultimoUsoEm ? formatarDataHora(c.ultimoUsoEm) : "Nunca usada"}</td>
                <td>
                  <span className={c.revogada ? "tag tag-neutra" : "tag tag-sucesso"}>
                    {c.revogada ? "Revogada" : "Ativa"}
                  </span>
                </td>
                <td>
                  {c.revogada ? null : (
                    <BotaoDeConfirmacao
                      rotulo="Revogar"
                      rotuloDeConfirmacao="Confirmar revogação"
                      aoConfirmar={() => void aoRevogar(c.id)}
                      desabilitado={!podeGerenciar || ocupado}
                      titulo={podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={(e) => void aoCriar(e)} noValidate>
        <h3>Nova chave</h3>
        <div className="grade-2">
          <div className="field">
            <label className="label" htmlFor="chave-nome">
              Nome
            </label>
            <input
              id="chave-nome"
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Pipeline de CI"
              disabled={!podeGerenciar}
              aria-invalid={erroDoCampo !== null}
            />
            {erroDoCampo ? <span className="erro-campo">{erroDoCampo}</span> : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="chave-papel">
              Papel da chave
            </label>
            <select
              id="chave-papel"
              className="input"
              value={papel}
              disabled={!podeGerenciar}
              onChange={(e) => setPapel(PAPEIS_DA_CHAVE.find((p) => p === e.target.value) ?? "DESENVOLVEDOR")}
            >
              {PAPEIS_DA_CHAVE.map((p) => (
                <option key={p} value={p}>
                  {rotuloDoPapel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!podeGerenciar ? <span className="hint">{TEXTO_SEM_PERMISSAO}</span> : null}
        <button type="submit" className="btn btn-cta" disabled={!podeGerenciar || ocupado}>
          Criar chave
        </button>
      </form>
    </div>
  );
};
