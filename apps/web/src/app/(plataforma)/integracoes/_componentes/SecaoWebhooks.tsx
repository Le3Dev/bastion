"use client";

import { EVENTOS_DE_WEBHOOK, type EventoDeWebhook } from "@bastion/contratos";
import { useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { alterarWebhook, cadastrarWebhook, listarWebhooks, removerWebhook } from "@/api/contas";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { Icone } from "@/componentes/Icone";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { BotaoDeConfirmacao } from "./BotaoDeConfirmacao";
import { exemploDeEntregaDoWebhook, exemploDeVerificacaoEmNode } from "./exemplos";

export const SecaoWebhooks = () => {
  const { pode } = useSessao();
  const podeGerenciar = pode("webhooks");
  const { dados, erro: erroDaLista, carregando, recarregar } = useConsulta(listarWebhooks);
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<EventoDeWebhook[]>([]);
  const [erroDaUrl, setErroDaUrl] = useState<string | null>(null);
  const [erroDosEventos, setErroDosEventos] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const alternarEvento = (evento: EventoDeWebhook): void => {
    setEventos((atual) => (atual.includes(evento) ? atual.filter((e) => e !== evento) : [...atual, evento]));
  };

  const executar = async (acao: () => Promise<unknown>): Promise<void> => {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
      recarregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const aoCadastrar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setErro(null);
    setCopiado(false);
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
    await executar(async () => {
      const resposta = await cadastrarWebhook({ url: url.trim(), eventos });
      setSegredo(resposta.segredoDeAssinatura);
      setUrl("");
      setEventos([]);
    });
  };

  const aoCopiar = async (): Promise<void> => {
    if (segredo === null) return;
    try {
      await navigator.clipboard.writeText(segredo);
      setCopiado(true);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  };

  const webhooks = dados ?? [];

  return (
    <div className="card pilha">
      <h2 className="card-titulo">Webhooks de saída</h2>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {erroDaLista ? <Alerta tipo="error">{erroDaLista}</Alerta> : null}
      {segredo ? (
        <Alerta tipo="warning">
          <div className="pilha">
            <span>Segredo de assinatura: copie agora; ele não será mostrado de novo.</span>
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
        <p className="texto-2">Carregando webhooks...</p>
      ) : webhooks.length === 0 ? (
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
                      disabled={!podeGerenciar || ocupado}
                      title={podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO}
                      onClick={() => void executar(() => alterarWebhook(w.id, { ativo: !w.ativo }))}
                    >
                      {w.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <BotaoDeConfirmacao
                      rotulo="Remover"
                      rotuloDeConfirmacao="Confirmar remoção"
                      aoConfirmar={() => void executar(() => removerWebhook(w.id))}
                      desabilitado={!podeGerenciar || ocupado}
                      titulo={podeGerenciar ? undefined : TEXTO_SEM_PERMISSAO}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={(e) => void aoCadastrar(e)} noValidate>
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
            disabled={!podeGerenciar}
            aria-invalid={erroDaUrl !== null}
          />
          {erroDaUrl ? <span className="erro-campo">{erroDaUrl}</span> : null}
        </div>
        <div className="field">
          <span className="label">Eventos</span>
          <div className="linha">
            {EVENTOS_DE_WEBHOOK.map((e) => (
              <label key={e} className="linha">
                <input
                  type="checkbox"
                  checked={eventos.includes(e)}
                  onChange={() => alternarEvento(e)}
                  disabled={!podeGerenciar}
                />
                <span className="mono">{e}</span>
              </label>
            ))}
          </div>
          {erroDosEventos ? <span className="erro-campo">{erroDosEventos}</span> : null}
          {!podeGerenciar ? <span className="hint">{TEXTO_SEM_PERMISSAO}</span> : null}
        </div>
        <button type="submit" className="btn btn-cta" disabled={!podeGerenciar || ocupado}>
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
