"use client";

import { useState, type FormEvent } from "react";
import { Alerta } from "@/componentes/Alerta";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { alternarWebhook, cadastrarWebhook, removerWebhook } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarDataHora } from "@/prototipo/formatacao";
import type { EventoDeWebhook, WebhookDeSaida } from "@/prototipo/tipos";
import { BotaoDeConfirmacao } from "./BotaoDeConfirmacao";
import { exemploDeEntregaDoWebhook, exemploDeVerificacaoEmNode } from "./exemplos";

interface PropsDaSecao {
  webhooks: WebhookDeSaida[];
  somenteLeitura: boolean;
}

const EVENTOS: EventoDeWebhook[] = ["avaliacao.concluida", "avaliacao.falhou", "achado.criado", "achado.corrigido"];
const TEXTO_SOMENTE_LEITURA = "Seu papel é somente leitura";

export const SecaoWebhooks = ({ webhooks, somenteLeitura }: PropsDaSecao) => {
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<EventoDeWebhook[]>([]);
  const [erroDaUrl, setErroDaUrl] = useState<string | null>(null);
  const [erroDosEventos, setErroDosEventos] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const alternarEvento = (evento: EventoDeWebhook) => {
    setEventos((atual) => (atual.includes(evento) ? atual.filter((e) => e !== evento) : [...atual, evento]));
  };

  const executar = (acao: () => void) => {
    setErro(null);
    try {
      acao();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const aoCadastrar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErro(null);
    let valido = true;
    if (!url.trim().toLowerCase().startsWith("https://")) {
      setErroDaUrl("Informe uma URL que comece com https://.");
      valido = false;
    } else {
      setErroDaUrl(null);
    }
    if (eventos.length === 0) {
      setErroDosEventos("Escolha ao menos um evento.");
      valido = false;
    } else {
      setErroDosEventos(null);
    }
    if (!valido) return;
    try {
      cadastrarWebhook(url, eventos);
      setUrl("");
      setEventos([]);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  return (
    <div className="card pilha">
      <h2 className="card-titulo">Webhooks de saída</h2>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      {webhooks.length === 0 ? (
        <EstadoVazio titulo="Nenhum webhook cadastrado" descricao="Cadastre uma URL para receber eventos da plataforma." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Eventos</th>
              <th>Ativo</th>
              <th>Último envio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id}>
                <td className="mono">{w.url}</td>
                <td>
                  <div className="linha">
                    {w.eventos.map((e) => (
                      <span key={e} className="tag tag-neutra">
                        {e}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={w.ativo ? "tag tag-sucesso" : "tag tag-neutra"}>{w.ativo ? "Ativo" : "Inativo"}</span>
                </td>
                <td className="texto-2">{w.ultimoEnvioEm ? formatarDataHora(w.ultimoEnvioEm) : "Sem envios"}</td>
                <td>
                  <div className="linha">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={somenteLeitura}
                      title={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined}
                      onClick={() => executar(() => alternarWebhook(w.id))}
                    >
                      {w.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <BotaoDeConfirmacao
                      rotulo="Remover"
                      rotuloDeConfirmacao="Confirmar remoção"
                      aoConfirmar={() => executar(() => removerWebhook(w.id))}
                      desabilitado={somenteLeitura}
                      titulo={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={aoCadastrar} noValidate>
        <h3>Novo webhook</h3>
        <div className="field">
          <label className="label" htmlFor="webhook-url">
            URL (https)
          </label>
          <input
            id="webhook-url"
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://seu-servico.exemplo.com.br/bastion"
            disabled={somenteLeitura}
            aria-invalid={erroDaUrl !== null}
          />
          {erroDaUrl ? <span className="erro-campo">{erroDaUrl}</span> : null}
        </div>
        <div className="field">
          <span className="label">Eventos</span>
          <div className="linha">
            {EVENTOS.map((e) => (
              <label key={e} className="linha">
                <input
                  type="checkbox"
                  checked={eventos.includes(e)}
                  onChange={() => alternarEvento(e)}
                  disabled={somenteLeitura}
                />
                <span className="mono">{e}</span>
              </label>
            ))}
          </div>
          {erroDosEventos ? <span className="erro-campo">{erroDosEventos}</span> : null}
          {somenteLeitura ? <span className="hint">{TEXTO_SOMENTE_LEITURA}</span> : null}
        </div>
        <button type="submit" className="btn btn-cta" disabled={somenteLeitura}>
          Cadastrar webhook
        </button>
      </form>

      <div className="pilha">
        <h3>Como validar as entregas</h3>
        <p className="texto-2">
          Cada entrega leva o cabeçalho <span className="mono">X-Bastion-Assinatura: sha256=&lt;hex&gt;</span>, um HMAC-SHA256 do
          corpo bruto calculado com o segredo do webhook. O cabeçalho <span className="mono">X-Bastion-Evento-Id</span> identifica o
          evento: guarde os IDs já tratados para ignorar reenvios (idempotência).
        </p>
        <pre className="bloco-codigo">{exemploDeEntregaDoWebhook}</pre>
        <p className="texto-2">
          Verifique a assinatura em tempo constante, com <span className="mono">crypto.timingSafeEqual</span>, antes de processar:
        </p>
        <pre className="bloco-codigo">{exemploDeVerificacaoEmNode}</pre>
      </div>
    </div>
  );
};
