"use client";

import type { CorpoDeConectorDeIa, CorpoDeCredencialDeTeste, SistemaDto } from "@bastion/contratos";
import { useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { TEXTO_SEM_PERMISSAO } from "@/api/sessao";
import {
  definirConectorDeIa,
  definirCredencialDeTeste,
  removerConectorDeIa,
  removerCredencialDeTeste,
} from "@/api/sistemas";
import { Alerta } from "@/componentes/Alerta";

interface Propriedades {
  sistema: SistemaDto;
  podeGerenciar: boolean;
  aoAlterar: () => void;
}

interface Mensagem {
  tipo: "success" | "error";
  texto: string;
}

interface Cabecalho {
  chave: string;
  valor: string;
}

const MODOS: CorpoDeCredencialDeTeste["modo"][] = ["FORMULARIO", "JSON"];

export const ConfiguracaoDoSistema = ({ sistema, podeGerenciar, aoAlterar }: Propriedades) => {
  const id = sistema.id;
  const titulo = (parte: string): string => `${parte}-${id}`;
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Credencial de teste
  const [modo, setModo] = useState<CorpoDeCredencialDeTeste["modo"]>(sistema.credencialDeTeste.modo ?? "FORMULARIO");
  const [urlDeLogin, setUrlDeLogin] = useState(sistema.credencialDeTeste.urlDeLogin ?? "");
  const [campoUsuario, setCampoUsuario] = useState("username");
  const [campoSenha, setCampoSenha] = useState("password");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [indicadorDeSucesso, setIndicadorDeSucesso] = useState(sistema.credencialDeTeste.indicadorDeSucesso ?? "");

  // Conector de IA
  const [urlDoConector, setUrlDoConector] = useState(sistema.conectorDeIa.url ?? "");
  const [cabecalhos, setCabecalhos] = useState<Cabecalho[]>([]);
  const [modeloDoCorpo, setModeloDoCorpo] = useState('{"mensagem": "{{mensagem}}"}');
  const [caminhoDaResposta, setCaminhoDaResposta] = useState(sistema.conectorDeIa.caminhoDaResposta ?? "");
  const [frases, setFrases] = useState("");

  const executar = async (acao: () => Promise<unknown>, sucesso: string): Promise<boolean> => {
    setMensagem(null);
    setOcupado(true);
    try {
      await acao();
      setMensagem({ tipo: "success", texto: sucesso });
      aoAlterar();
      return true;
    } catch (e) {
      setMensagem({ tipo: "error", texto: mensagemDoErro(e) });
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const salvarCredencial = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    const ok = await executar(
      () =>
        definirCredencialDeTeste(id, {
          modo,
          urlDeLogin: urlDeLogin.trim(),
          campoUsuario: campoUsuario.trim(),
          campoSenha: campoSenha.trim(),
          usuario,
          senha,
          indicadorDeSucesso: indicadorDeSucesso.trim(),
        }),
      "Credencial de teste salva.",
    );
    if (ok) {
      setUsuario("");
      setSenha("");
    }
  };

  const salvarConector = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    const mapa: Record<string, string> = {};
    for (const c of cabecalhos) if (c.chave.trim() !== "") mapa[c.chave.trim()] = c.valor;
    const corpo: CorpoDeConectorDeIa = {
      url: urlDoConector.trim(),
      modeloDoCorpo,
      caminhoDaResposta: caminhoDaResposta.trim(),
      frasesSigilosas: frases
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f !== ""),
      ...(Object.keys(mapa).length > 0 ? { cabecalhos: mapa } : {}),
    };
    const ok = await executar(() => definirConectorDeIa(id, corpo), "Conector de IA salvo.");
    if (ok) setCabecalhos([]);
  };

  const desabilitado = !podeGerenciar || ocupado;
  const dica = podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO;
  const credencial = sistema.credencialDeTeste;
  const conector = sistema.conectorDeIa;

  return (
    <div className="pilha">
      <div aria-live="polite">{mensagem ? <Alerta tipo={mensagem.tipo}>{mensagem.texto}</Alerta> : null}</div>

      <section className="pilha" aria-label="Credencial de teste">
        <h3 className="card-titulo">
          Credencial de teste{" "}
          {credencial.configurada ? (
            <span className="tag tag-baixa">Configurada</span>
          ) : (
            <span className="tag tag-neutra">Não configurada</span>
          )}
        </h3>
        <Alerta tipo="info">
          A senha é guardada cifrada e nunca é exibida de novo. Use uma conta de teste da homologação, nunca uma conta real.
        </Alerta>
        {credencial.configurada ? (
          <p className="texto-2">
            Login em <span className="mono">{credencial.urlDeLogin}</span> ({credencial.modo}). Para trocar, preencha o
            formulário novamente.
          </p>
        ) : null}
        <form className="pilha" onSubmit={(e) => void salvarCredencial(e)}>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-modo")}>
              Modo de login
            </label>
            <select
              id={titulo("cred-modo")}
              className="input"
              value={modo}
              onChange={(e) => setModo(e.target.value === "JSON" ? "JSON" : "FORMULARIO")}
            >
              {MODOS.map((m) => (
                <option key={m} value={m}>
                  {m === "FORMULARIO" ? "Formulário (form-urlencoded)" : "JSON"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-url")}>
              URL de login
            </label>
            <input id={titulo("cred-url")} className="input" type="url" required value={urlDeLogin} onChange={(e) => setUrlDeLogin(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-campo-usuario")}>
              Campo do usuário
            </label>
            <input id={titulo("cred-campo-usuario")} className="input" required value={campoUsuario} onChange={(e) => setCampoUsuario(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-campo-senha")}>
              Campo da senha
            </label>
            <input id={titulo("cred-campo-senha")} className="input" required value={campoSenha} onChange={(e) => setCampoSenha(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-usuario")}>
              Usuário de teste
            </label>
            <input id={titulo("cred-usuario")} className="input" required autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-senha")}>
              Senha de teste
            </label>
            <input id={titulo("cred-senha")} className="input" type="password" required autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={titulo("cred-indicador")}>
              Indicador de sucesso do login
            </label>
            <input id={titulo("cred-indicador")} className="input" required value={indicadorDeSucesso} onChange={(e) => setIndicadorDeSucesso(e.target.value)} />
            <span className="hint">Texto que aparece na resposta somente quando o login dá certo.</span>
          </div>
          <div className="linha">
            <button type="submit" className="btn btn-cta btn-sm" disabled={desabilitado} title={dica}>
              Salvar credencial
            </button>
            {credencial.configurada ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={desabilitado}
                title={dica}
                onClick={() => void executar(() => removerCredencialDeTeste(id), "Credencial de teste removida.")}
              >
                Remover credencial
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {sistema.tipo === "APP_COM_IA" ? (
        <section className="pilha" aria-label="Conector de IA">
          <h3 className="card-titulo">
            Conector de IA{" "}
            {conector.configurado ? (
              <span className="tag tag-baixa">Configurado</span>
            ) : (
              <span className="tag tag-neutra">Não configurado</span>
            )}
          </h3>
          {conector.configurado ? (
            <p className="texto-2">
              Endpoint <span className="mono">{conector.url}</span>, resposta em{" "}
              <span className="mono">{conector.caminhoDaResposta}</span>. Os cabeçalhos não são exibidos de novo.
            </p>
          ) : null}
          <form className="pilha" onSubmit={(e) => void salvarConector(e)}>
            <div className="field">
              <label className="label" htmlFor={titulo("ia-url")}>
                URL do endpoint do chatbot
              </label>
              <input id={titulo("ia-url")} className="input" type="url" required value={urlDoConector} onChange={(e) => setUrlDoConector(e.target.value)} />
            </div>
            <div className="field">
              <span className="label">Cabeçalhos (opcional)</span>
              {cabecalhos.map((c, i) => (
                <div className="linha" key={i}>
                  <input
                    className="input"
                    aria-label={`Nome do cabeçalho ${i + 1}`}
                    placeholder="Nome"
                    value={c.chave}
                    onChange={(e) => setCabecalhos((atual) => atual.map((x, j) => (j === i ? { ...x, chave: e.target.value } : x)))}
                  />
                  <input
                    className="input"
                    aria-label={`Valor do cabeçalho ${i + 1}`}
                    placeholder="Valor"
                    type="password"
                    autoComplete="off"
                    value={c.valor}
                    onChange={(e) => setCabecalhos((atual) => atual.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  />
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setCabecalhos((atual) => atual.filter((_, j) => j !== i))}>
                    Remover
                  </button>
                </div>
              ))}
              <div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setCabecalhos((atual) => [...atual, { chave: "", valor: "" }])}>
                  Adicionar cabeçalho
                </button>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={titulo("ia-modelo")}>
                Modelo do corpo da requisição
              </label>
              <textarea id={titulo("ia-modelo")} className="input mono" rows={3} required value={modeloDoCorpo} onChange={(e) => setModeloDoCorpo(e.target.value)} />
              <span className="hint">Use {"{{mensagem}}"} onde a mensagem de teste deve entrar.</span>
            </div>
            <div className="field">
              <label className="label" htmlFor={titulo("ia-caminho")}>
                Caminho da resposta
              </label>
              <input id={titulo("ia-caminho")} className="input mono" required placeholder="resposta.texto" value={caminhoDaResposta} onChange={(e) => setCaminhoDaResposta(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor={titulo("ia-frases")}>
                Frases sigilosas (uma por linha)
              </label>
              <textarea id={titulo("ia-frases")} className="input" rows={3} value={frases} onChange={(e) => setFrases(e.target.value)} />
              <span className="hint">Trechos do prompt do sistema que nunca podem aparecer nas respostas.</span>
            </div>
            <div className="linha">
              <button type="submit" className="btn btn-cta btn-sm" disabled={desabilitado} title={dica}>
                Salvar conector
              </button>
              {conector.configurado ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={desabilitado}
                  title={dica}
                  onClick={() => void executar(() => removerConectorDeIa(id), "Conector de IA removido.")}
                >
                  Remover conector
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      <span className="hint">
        A permissão de criar registros de teste (marcados com o prefixo bastion-teste-) é escolhida ao iniciar a avaliação Completo.
      </span>
    </div>
  );
};
