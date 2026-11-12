import {
  CorpoDoWebhook,
  EVENTOS_DE_WEBHOOK,
  type CorpoDeAlteracaoDeWebhook,
  type CorpoDeNovoWebhook,
  type EventoDeWebhook,
  type RespostaDeNovoWebhook,
  type TarefaEntregarWebhook,
  type WebhookDto,
} from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { naoEncontrado } from '../../compartilhado/erros';
import {
  registrarManipuladorDoOutbox,
  registrarNoOutbox,
  type EventoDoOutbox,
} from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { registrarManipuladorDeResultado } from '../../integracoes/consumidor-de-resultados';
import type { Filas } from '../../integracoes/filas';
import { WebhookDeSaida } from '../dominio/WebhookDeSaida';
import { assinarCorpo } from '../infraestrutura/assinatura-de-webhook';
import { RepositorioDeEntregasDeWebhook } from '../infraestrutura/RepositorioDeEntregasDeWebhook';
import { RepositorioDeWebhooks } from '../infraestrutura/RepositorioDeWebhooks';
import { gerarSegredoDeWebhook } from '../infraestrutura/tokens';

/** Eventos de domínio (outbox) que viram eventos de webhook. */
export const EVENTO_DE_WEBHOOK_POR_EVENTO_DE_DOMINIO: Readonly<Record<string, EventoDeWebhook>> = {
  AvaliacaoConcluida: 'avaliacao.concluida',
  AvaliacaoFalhou: 'avaliacao.falhou',
  AchadoCriado: 'achado.criado',
  AchadoCorrigido: 'achado.corrigido',
};

const ehEventoDeWebhook = (valor: string): valor is EventoDeWebhook =>
  (EVENTOS_DE_WEBHOOK as readonly string[]).includes(valor);

export const paraWebhookDto = (webhook: WebhookDeSaida): WebhookDto => {
  const dados = webhook.paraDados();
  return {
    id: dados.id,
    url: dados.url,
    eventos: dados.eventos.filter(ehEventoDeWebhook),
    ativo: dados.ativo,
    criadoEm: dados.criadoEm.toISOString(),
    ultimoEnvioEm: dados.ultimoEnvioEm?.toISOString() ?? null,
  };
};

export class ServicoDeWebhooks {
  constructor(
    private readonly db: Banco,
    private readonly filas: Filas,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly webhooks = new RepositorioDeWebhooks(),
    private readonly entregas = new RepositorioDeEntregasDeWebhook(),
  ) {}

  /** Liga o serviço ao outbox (eventos de domínio) e ao consumidor de resultados do worker. */
  registrarManipuladores(): void {
    for (const tipo of Object.keys(EVENTO_DE_WEBHOOK_POR_EVENTO_DE_DOMINIO)) {
      registrarManipuladorDoOutbox(tipo, (evento) => this.dispararEntregas(evento), 'webhooks');
    }
    registrarManipuladorDeResultado('entrega-concluida', async (evento, tx) => {
      const entrega = await this.entregas.buscarPorId(tx, evento.entregaId);
      if (!entrega) return;
      const agora = this.relogio.agora();
      await this.entregas.registrarResultado(tx, entrega.id, {
        sucesso: evento.sucesso,
        status: evento.status,
        agora,
      });
      const webhook = await this.webhooks.buscarPorId(tx, entrega.organizacaoId, entrega.webhookId);
      if (webhook) {
        webhook.registrarEnvio(agora);
        await this.webhooks.salvar(tx, webhook);
      }
    });
  }

  async listar(contexto: ContextoDaRequisicao): Promise<WebhookDto[]> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const lista = await this.webhooks.listar(tx, contexto.organizacaoId);
      return lista.map(paraWebhookDto);
    });
  }

  /** O segredo de assinatura é devolvido uma única vez. */
  async cadastrar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeNovoWebhook,
  ): Promise<RespostaDeNovoWebhook> {
    const segredo = gerarSegredoDeWebhook();
    const webhook = WebhookDeSaida.cadastrar(
      {
        id: gerarIdentificador(),
        organizacaoId: contexto.organizacaoId,
        url: corpo.url,
        eventos: corpo.eventos,
        segredo,
      },
      this.relogio.agora(),
    );
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      await this.webhooks.inserir(tx, webhook);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'WEBHOOK_CADASTRADO',
        alvo: webhook.url,
        detalhe: { webhookId: webhook.id, eventos: [...webhook.eventos] },
      });
      await registrarNoOutbox(tx, webhook.puxarEventos());
      return { webhook: paraWebhookDto(webhook), segredoDeAssinatura: segredo };
    });
  }

  async alterar(
    contexto: ContextoDaRequisicao,
    webhookId: string,
    corpo: CorpoDeAlteracaoDeWebhook,
  ): Promise<WebhookDto> {
    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const webhook = await this.exigir(tx, contexto.organizacaoId, webhookId);
      if (corpo.ativo) webhook.ativar(agora);
      else webhook.desativar(agora);
      await this.webhooks.salvar(tx, webhook);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'WEBHOOK_ALTERADO',
        alvo: webhook.url,
        detalhe: { webhookId: webhook.id, ativo: corpo.ativo },
      });
      await registrarNoOutbox(tx, webhook.puxarEventos());
      return paraWebhookDto(webhook);
    });
  }

  async remover(contexto: ContextoDaRequisicao, webhookId: string): Promise<void> {
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const webhook = await this.exigir(tx, contexto.organizacaoId, webhookId);
      await this.webhooks.remover(tx, contexto.organizacaoId, webhook.id);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'WEBHOOK_REMOVIDO',
        alvo: webhook.url,
        detalhe: { webhookId: webhook.id },
      });
    });
  }

  /**
   * Para cada webhook ativo que escuta o evento: cria a entrega, monta e assina o corpo
   * (HMAC-SHA256) e enfileira. O enfileiramento só ocorre depois do commit; repetir o evento
   * não duplica a entrega (a tarefa usa o id da entrega como `jobId`).
   */
  private async dispararEntregas(evento: EventoDoOutbox): Promise<void> {
    const tipoDoWebhook = EVENTO_DE_WEBHOOK_POR_EVENTO_DE_DOMINIO[evento.tipo];
    if (!tipoDoWebhook) return;
    const agora = this.relogio.agora();

    const tarefas = await emContextoDaOrganizacao(this.db, evento.organizacaoId, async (tx) => {
      const alvos = (await this.webhooks.listar(tx, evento.organizacaoId)).filter((w) =>
        w.escutaEvento(tipoDoWebhook),
      );
      const montadas: TarefaEntregarWebhook[] = [];
      for (const webhook of alvos) {
        const existente = await this.entregas.buscarPorWebhookEEvento(tx, webhook.id, evento.id);
        if (existente && existente.estado !== 'PENDENTE') continue;
        const entregaId = existente?.id ?? gerarIdentificador();
        if (!existente) {
          await this.entregas.criar(tx, {
            id: entregaId,
            organizacaoId: evento.organizacaoId,
            webhookId: webhook.id,
            eventoId: evento.id,
            tipoDoEvento: tipoDoWebhook,
            criadaEm: agora,
          });
        }
        const corpo = JSON.stringify(
          CorpoDoWebhook.parse({
            id: evento.id,
            tipo: tipoDoWebhook,
            ocorridoEm: evento.ocorridoEm.toISOString(),
            organizacaoId: evento.organizacaoId,
            dados: evento.dados,
          }),
        );
        montadas.push({
          entregaId,
          organizacaoId: evento.organizacaoId,
          url: webhook.url,
          corpo,
          assinatura: assinarCorpo(webhook.segredo, corpo),
          eventoId: evento.id,
          tipoDoEvento: tipoDoWebhook,
        });
      }
      return montadas;
    });

    for (const tarefa of tarefas) {
      await this.filas.enfileirarEntregaDeWebhook(tarefa);
    }
  }

  private async exigir(
    tx: Transacao,
    organizacaoId: string,
    webhookId: string,
  ): Promise<WebhookDeSaida> {
    const webhook = await this.webhooks.buscarPorId(tx, organizacaoId, webhookId);
    if (!webhook) throw naoEncontrado('Webhook');
    return webhook;
  }
}
