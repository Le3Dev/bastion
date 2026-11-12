import {
  CABECALHO_ASSINATURA,
  CABECALHO_EVENTO_ID,
  CABECALHO_EVENTO_TIPO,
  TarefaEntregarWebhook,
} from '@bastion/contratos';
import type { ClienteHttp } from '../guardiao-de-escopo/cliente-http';
import type { PublicadorDeResultados } from '../resultados';

export interface DependenciasDoEntregador {
  clienteHttp: Pick<ClienteHttp, 'requisitarWebhook'>;
  publicador: Pick<PublicadorDeResultados, 'publicar'>;
}

export interface EntregadorDeWebhook {
  /** Lança erro quando a entrega falha, para o BullMQ tentar de novo. */
  entregar(tarefa: unknown): Promise<void>;
}

export function criarEntregadorDeWebhook(deps: DependenciasDoEntregador): EntregadorDeWebhook {
  async function entregar(tarefaBruta: unknown): Promise<void> {
    const analise = TarefaEntregarWebhook.safeParse(tarefaBruta);
    if (!analise.success) {
      throw new Error('Tarefa de entrega de webhook inválida.');
    }
    const tarefa = analise.data;

    let sucesso = false;
    let status: number | null = null;
    let mensagem: string;
    try {
      const resposta = await deps.clienteHttp.requisitarWebhook({
        url: tarefa.url,
        corpo: tarefa.corpo,
        cabecalhos: {
          'content-type': 'application/json',
          [CABECALHO_ASSINATURA]: tarefa.assinatura,
          [CABECALHO_EVENTO_ID]: tarefa.eventoId,
          [CABECALHO_EVENTO_TIPO]: tarefa.tipoDoEvento,
        },
      });
      status = resposta.status;
      sucesso = status >= 200 && status < 300;
      mensagem = sucesso ? `Entregue (HTTP ${status}).` : `O destino respondeu HTTP ${status}.`;
    } catch (erro) {
      mensagem = erro instanceof Error && erro.message !== '' ? erro.message : 'Falha desconhecida na entrega.';
    }

    await deps.publicador.publicar({
      tipo: 'entrega-concluida',
      organizacaoId: tarefa.organizacaoId,
      entregaId: tarefa.entregaId,
      sucesso,
      status,
      mensagem,
    });

    if (!sucesso) throw new Error(mensagem);
  }

  return { entregar };
}
