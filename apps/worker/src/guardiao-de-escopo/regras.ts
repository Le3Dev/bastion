import type { EscopoDaTarefa, PerfilDeAvaliacao } from '@bastion/contratos';
import { hostPertenceAoDominio, normalizarHost } from '@bastion/dominio-compartilhado';

export interface Decisao {
  permitida: boolean;
  motivo: string;
}

export type EscopoDeRegras = Pick<EscopoDaTarefa, 'hostsPermitidos' | 'dominiosBloqueados'>;

export interface PedidoDeRequisicao {
  url: string;
  metodo: string;
  perfil: PerfilDeAvaliacao;
  escopo: EscopoDeRegras;
}

const METODOS_DO_PERFIL_PASSIVO = ['GET', 'HEAD'];

const negar = (motivo: string): Decisao => ({ permitida: false, motivo });

export function avaliarRequisicao(pedido: PedidoDeRequisicao): Decisao {
  let url: URL;
  try {
    url = new URL(pedido.url);
  } catch {
    return negar('URL inválida');
  }

  const host = normalizarHost(url.hostname);

  // Produção é sempre bloqueada, mesmo que apareça como permitida.
  if (pedido.escopo.dominiosBloqueados.some((dominio) => hostPertenceAoDominio(host, normalizarHost(dominio)))) {
    return negar('Domínio de produção declarado');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return negar('Protocolo não permitido: somente http e https');
  }

  if (
    pedido.perfil === 'PASSIVO' &&
    !METODOS_DO_PERFIL_PASSIVO.includes(pedido.metodo.toUpperCase())
  ) {
    return negar('Método não permitido no perfil passivo');
  }

  if (!pedido.escopo.hostsPermitidos.some((permitido) => normalizarHost(permitido) === host)) {
    return negar('Host fora do escopo verificado');
  }

  return { permitida: true, motivo: 'Dentro do escopo verificado' };
}

export interface PedidoDeRedirecionamento {
  origem: string;
  destino: string;
  /** Número deste redirecionamento na cadeia (1 para o primeiro). */
  saltos: number;
  maximoDeSaltos?: number;
  escopo: EscopoDeRegras;
  perfil: PerfilDeAvaliacao;
}

export function avaliarRedirecionamento(pedido: PedidoDeRedirecionamento): Decisao {
  const maximo = pedido.maximoDeSaltos ?? 5;
  if (pedido.saltos > maximo) {
    return negar(`Redirecionamentos em excesso (máximo de ${maximo})`);
  }
  let destino: URL;
  try {
    destino = new URL(pedido.destino, pedido.origem);
  } catch {
    return negar('Destino de redirecionamento inválido');
  }
  const decisao = avaliarRequisicao({
    url: destino.toString(),
    metodo: 'GET',
    perfil: pedido.perfil,
    escopo: pedido.escopo,
  });
  return decisao.permitida
    ? decisao
    : negar(`Redirecionamento bloqueado: ${decisao.motivo}`);
}
