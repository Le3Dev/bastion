import { criarEvento, ErroDeDominio } from '@bastion/dominio-compartilhado';
import { EVENTOS_DE_WEBHOOK } from '@bastion/contratos';
import type { EventoDeWebhook } from './eventos';

export interface DadosDoWebhook {
  id: string;
  organizacaoId: string;
  url: string;
  eventos: string[];
  segredo: string;
  ativo: boolean;
  criadoEm: Date;
  ultimoEnvioEm: Date | null;
}

const EVENTOS_VALIDOS: readonly string[] = EVENTOS_DE_WEBHOOK;

export class WebhookDeSaida {
  private eventosDeDominio: EventoDeWebhook[] = [];

  private constructor(private dados: DadosDoWebhook) {}

  static cadastrar(
    dados: { id: string; organizacaoId: string; url: string; eventos: string[]; segredo: string },
    agora: Date,
  ): WebhookDeSaida {
    const url = WebhookDeSaida.validarUrl(dados.url);
    if (dados.eventos.length === 0) {
      throw new ErroDeDominio('Escolha ao menos um evento para o webhook.', 'EVENTOS_OBRIGATORIOS');
    }
    const invalido = dados.eventos.find((e) => !EVENTOS_VALIDOS.includes(e));
    if (invalido !== undefined) {
      throw new ErroDeDominio(`Evento desconhecido: ${invalido}.`, 'EVENTO_INVALIDO');
    }
    if (dados.segredo.trim() === '') {
      throw new ErroDeDominio('O segredo do webhook é obrigatório.', 'SEGREDO_OBRIGATORIO');
    }
    const webhook = new WebhookDeSaida({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      url,
      eventos: [...new Set(dados.eventos)],
      segredo: dados.segredo,
      ativo: true,
      criadoEm: agora,
      ultimoEnvioEm: null,
    });
    webhook.eventosDeDominio.push(
      criarEvento('WebhookCadastrado', dados.organizacaoId, {
        webhookId: dados.id,
        url,
        eventos: webhook.dados.eventos,
      }, agora),
    );
    return webhook;
  }

  static reconstituir(dados: DadosDoWebhook): WebhookDeSaida {
    return new WebhookDeSaida({ ...dados, eventos: [...dados.eventos] });
  }

  get id(): string {
    return this.dados.id;
  }
  get organizacaoId(): string {
    return this.dados.organizacaoId;
  }
  get url(): string {
    return this.dados.url;
  }
  get segredo(): string {
    return this.dados.segredo;
  }
  get ativo(): boolean {
    return this.dados.ativo;
  }
  get eventos(): readonly string[] {
    return [...this.dados.eventos];
  }

  ativar(agora: Date): void {
    this.alternar(true, agora);
  }

  desativar(agora: Date): void {
    this.alternar(false, agora);
  }

  registrarEnvio(agora: Date): void {
    this.dados.ultimoEnvioEm = agora;
  }

  escutaEvento(tipo: string): boolean {
    return this.dados.ativo && this.dados.eventos.includes(tipo);
  }

  paraDados(): DadosDoWebhook {
    return { ...this.dados, eventos: [...this.dados.eventos] };
  }

  puxarEventos(): EventoDeWebhook[] {
    const pendentes = this.eventosDeDominio;
    this.eventosDeDominio = [];
    return pendentes;
  }

  private alternar(ativo: boolean, agora: Date): void {
    if (this.dados.ativo === ativo) return;
    this.dados.ativo = ativo;
    this.eventosDeDominio.push(
      criarEvento('WebhookAlterado', this.dados.organizacaoId, {
        webhookId: this.dados.id,
        ativo,
      }, agora),
    );
  }

  private static validarUrl(valor: string): string {
    let url: URL;
    try {
      url = new URL(valor.trim());
    } catch {
      throw new ErroDeDominio('A URL do webhook é inválida.', 'URL_INVALIDA');
    }
    if (url.protocol !== 'https:') {
      throw new ErroDeDominio('A URL do webhook deve usar https://.', 'URL_INVALIDA');
    }
    return url.toString();
  }
}
