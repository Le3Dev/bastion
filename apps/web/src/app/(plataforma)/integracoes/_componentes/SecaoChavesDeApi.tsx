"use client";

import { useState, type FormEvent } from "react";
import { Alerta } from "@/componentes/Alerta";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { Icone } from "@/componentes/Icone";
import { criarChaveDeApi, revogarChaveDeApi } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarDataHora } from "@/prototipo/formatacao";
import type { ChaveDeApi } from "@/prototipo/tipos";
import { BotaoDeConfirmacao } from "./BotaoDeConfirmacao";

interface PropsDaSecao {
  chaves: ChaveDeApi[];
  somenteLeitura: boolean;
}

const TEXTO_SOMENTE_LEITURA = "Seu papel é somente leitura";

export const SecaoChavesDeApi = ({ chaves, somenteLeitura }: PropsDaSecao) => {
  const [nome, setNome] = useState("");
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const aoCriar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErro(null);
    setCopiado(false);
    if (nome.trim().length < 2) {
      setErroDoCampo("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    setErroDoCampo(null);
    try {
      const { segredoCompleto } = criarChaveDeApi(nome);
      setSegredo(segredoCompleto);
      setNome("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const aoCopiar = async () => {
    if (segredo === null) return;
    setErro(null);
    try {
      await navigator.clipboard.writeText(segredo);
      setCopiado(true);
    } catch (e) {
      setErro(`Não foi possível copiar automaticamente: ${mensagemDeErro(e)} Selecione o texto e copie manualmente.`);
    }
  };

  const aoRevogar = (id: string) => {
    setErro(null);
    try {
      revogarChaveDeApi(id);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  return (
    <div className="card pilha">
      <h2 className="card-titulo">Chaves de API</h2>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {segredo ? (
        <Alerta tipo="warning">
          <div className="pilha">
            <span>Copie agora; ele não será mostrado de novo.</span>
            <pre className="bloco-codigo">{segredo}</pre>
            <div className="linha">
              <button type="button" className="btn btn-sm" onClick={aoCopiar}>
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

      {chaves.length === 0 ? (
        <EstadoVazio titulo="Nenhuma chave de API" descricao="Crie uma chave para usar a API no seu pipeline de CI." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Prefixo</th>
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
                      aoConfirmar={() => aoRevogar(c.id)}
                      desabilitado={somenteLeitura}
                      titulo={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={aoCriar} noValidate>
        <h3>Nova chave</h3>
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
            disabled={somenteLeitura}
            aria-invalid={erroDoCampo !== null}
          />
          {erroDoCampo ? <span className="erro-campo">{erroDoCampo}</span> : null}
          {somenteLeitura ? <span className="hint">{TEXTO_SOMENTE_LEITURA}</span> : null}
        </div>
        <button type="submit" className="btn btn-cta" disabled={somenteLeitura}>
          Criar chave
        </button>
      </form>
    </div>
  );
};
