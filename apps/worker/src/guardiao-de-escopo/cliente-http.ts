import type { DecisaoDoGuardiao, PerfilDeAvaliacao } from '@bastion/contratos';
import type { Readable } from 'node:stream';
import { Agent, request } from 'undici';
import {
  avaliarHostLiteral,
  criarLookupSeguro,
  encontrarBloqueioDeEndereco,
  type ResolvedorDns,
} from './dns-seguro';
import { LimitadorDeTaxa } from './limitador-de-taxa';
import { avaliarRedirecionamento, avaliarRequisicao, type Decisao, type EscopoDeRegras } from './regras';

export const TEMPO_LIMITE_MS = 10_000;
export const TAMANHO_MAXIMO_DO_CORPO = 64 * 1024;
export const MAXIMO_DE_REDIRECIONAMENTOS = 5;

const STATUS_DE_REDIRECIONAMENTO = new Set([301, 302, 303, 307, 308]);

export interface DecisaoRegistrada {
  metodo: string;
  url: string;
  decisao: DecisaoDoGuardiao;
  motivo: string;
  status: number | null;
}

export interface RespostaHttp {
  /** URL final, depois dos redirecionamentos. */
  url: string;
  status: number;
  /** Nomes em minúsculas; `set-cookie` pode vir como lista. */
  cabecalhos: Record<string, string | string[]>;
  trechoDoCorpo: string;
}

export interface PedidoHttp {
  url: string;
  metodo: string;
  perfil: PerfilDeAvaliacao;
  escopo: EscopoDeRegras;
  cabecalhos?: Record<string, string>;
  corpo?: string;
  /** Substitui o limitador do cliente (ex.: taxa do escopo da tarefa). */
  limitador?: LimitadorDeTaxa;
  /** Chamado além do `aoDecidir` do cliente, para cada decisão deste pedido. */
  aoDecidir?: (decisao: DecisaoRegistrada) => void;
}

export interface PedidoDeWebhook {
  url: string;
  corpo: string;
  cabecalhos?: Record<string, string>;
  aoDecidir?: (decisao: DecisaoRegistrada) => void;
}

export interface OpcoesDoClienteHttp {
  permitirRedesPrivadas: boolean;
  limitador: LimitadorDeTaxa;
  aoDecidir?: (decisao: DecisaoRegistrada) => void;
  /** Só para testes: troca a espera do limitador. */
  esperar?: (ms: number) => Promise<void>;
  /** Só para testes: troca o DNS. */
  resolverDns?: ResolvedorDns;
  /** Só para testes: aceita webhooks em http. Em produção fica sempre `true`. */
  exigirHttpsNosWebhooks?: boolean;
}

export interface ClienteHttp {
  requisitar(pedido: PedidoHttp): Promise<RespostaHttp>;
  requisitarWebhook(pedido: PedidoDeWebhook): Promise<RespostaHttp>;
  fechar(): Promise<void>;
}

/** O Guardião de Escopo recusou a requisição. */
export class RequisicaoBloqueada extends Error {
  constructor(readonly motivo: string) {
    super(`Requisição bloqueada pelo Guardião de Escopo: ${motivo}.`);
    this.name = 'RequisicaoBloqueada';
  }
}

/** Falha de rede ou de tempo, com mensagem pronta para o usuário. */
export class ErroDeRequisicao extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string | null,
  ) {
    super(mensagem);
    this.name = 'ErroDeRequisicao';
  }
}

interface Politica {
  agente: Agent;
  metodoEfetivo: (metodo: string) => string;
  inicial: (url: string, metodo: string) => Decisao;
  salto: (origem: string, destino: string, saltos: number) => Decisao;
  /** `true` quando o corpo pode ser enviado no primeiro salto. */
  aceitaCorpo: (metodo: string) => boolean;
  /** Em webhooks, qualquer redirecionamento (mesmo permitido) é recusado. */
  seguirRedirecionamentos: boolean;
}

const negar = (motivo: string): Decisao => ({ permitida: false, motivo });

function extrairCodigo(erro: unknown): string | null {
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 5 && typeof atual === 'object' && atual !== null; nivel++) {
    if ('code' in atual && typeof atual.code === 'string') return atual.code;
    atual = 'cause' in atual ? atual.cause : undefined;
  }
  return null;
}

const CODIGOS_DE_TEMPO = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT']);

function descreverFalha(erro: unknown, host: string): ErroDeRequisicao {
  const codigo = extrairCodigo(erro);
  const nome = erro instanceof Error ? erro.name : '';
  if ((codigo !== null && CODIGOS_DE_TEMPO.has(codigo)) || nome === 'TimeoutError' || nome === 'AbortError') {
    return new ErroDeRequisicao(
      `A requisição a ${host} excedeu o tempo limite de ${TEMPO_LIMITE_MS / 1000} s.`,
      codigo ?? 'TEMPO_ESGOTADO',
    );
  }
  if (codigo !== null) {
    return new ErroDeRequisicao(`Não foi possível conectar a ${host} (${codigo}).`, codigo);
  }
  const detalhe = erro instanceof Error ? erro.message : 'erro desconhecido';
  return new ErroDeRequisicao(`Falha na requisição a ${host}: ${detalhe}.`, null);
}

async function lerTrecho(corpo: Readable): Promise<string> {
  corpo.on('error', () => undefined);
  const pedacos: Buffer[] = [];
  let total = 0;
  for await (const pedaco of corpo) {
    const bruto = Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco as Uint8Array);
    const restante = TAMANHO_MAXIMO_DO_CORPO - total;
    if (bruto.length >= restante) {
      pedacos.push(bruto.subarray(0, restante));
      total = TAMANHO_MAXIMO_DO_CORPO;
      break;
    }
    pedacos.push(bruto);
    total += bruto.length;
  }
  corpo.destroy();
  return Buffer.concat(pedacos).toString('utf8');
}

export function criarClienteHttp(opcoes: OpcoesDoClienteHttp): ClienteHttp {
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)));
  const exigirHttps = opcoes.exigirHttpsNosWebhooks ?? true;
  const lookup = criarLookupSeguro({
    permitirRedesPrivadas: opcoes.permitirRedesPrivadas,
    ...(opcoes.resolverDns ? { resolver: opcoes.resolverDns } : {}),
  });

  // A qualidade do certificado é avaliada à parte (sonda TLS); aqui o certificado autoassinado é aceito.
  const agenteDeAvaliacao = new Agent({
    connectTimeout: TEMPO_LIMITE_MS,
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 1_000,
    connect: { lookup, rejectUnauthorized: false },
  });
  // Webhooks vão para o endpoint do cliente: o certificado precisa ser válido.
  const agenteDeWebhook = new Agent({
    connectTimeout: TEMPO_LIMITE_MS,
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 1_000,
    connect: { lookup },
  });

  const registrar = (pedido: { aoDecidir?: (d: DecisaoRegistrada) => void }, decisao: DecisaoRegistrada): void => {
    opcoes.aoDecidir?.(decisao);
    pedido.aoDecidir?.(decisao);
  };

  async function executar(
    pedido: {
      url: string;
      metodo: string;
      cabecalhos?: Record<string, string>;
      corpo?: string;
      limitador?: LimitadorDeTaxa;
      aoDecidir?: (d: DecisaoRegistrada) => void;
    },
    politica: Politica,
  ): Promise<RespostaHttp> {
    let urlAtual = pedido.url;
    let metodo = politica.metodoEfetivo(pedido.metodo);
    let corpo = politica.aceitaCorpo(metodo) ? pedido.corpo : undefined;
    const limitador = pedido.limitador ?? opcoes.limitador;
    const cabecalhosBase: Record<string, string> = { 'user-agent': 'Bastion-Avaliador/0.1', ...pedido.cabecalhos };

    let origemDoSalto = urlAtual;

    for (let saltos = 0; ; saltos++) {
      const decisao =
        saltos === 0 ? politica.inicial(urlAtual, metodo) : politica.salto(origemDoSalto, urlAtual, saltos);
      const bloquear = (motivo: string): never => {
        registrar(pedido, { metodo, url: urlAtual, decisao: 'BLOQUEADA', motivo, status: null });
        throw new RequisicaoBloqueada(motivo);
      };
      if (!decisao.permitida) return bloquear(decisao.motivo);

      const url = new URL(urlAtual);
      const bloqueioLiteral = avaliarHostLiteral(url.hostname, { permitirRedesPrivadas: opcoes.permitirRedesPrivadas });
      if (bloqueioLiteral !== null && !bloqueioLiteral.permitido) return bloquear(bloqueioLiteral.motivo);

      const espera = limitador.reservar(url.hostname);
      if (espera > 0) await esperar(espera);

      let resposta: RespostaHttp;
      try {
        const bruta = await request(urlAtual, {
          dispatcher: politica.agente,
          method: metodo,
          headers: cabecalhosBase,
          ...(corpo !== undefined ? { body: corpo } : {}),
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
          headersTimeout: TEMPO_LIMITE_MS,
          bodyTimeout: TEMPO_LIMITE_MS,
        });
        const trechoDoCorpo = await lerTrecho(bruta.body);
        const cabecalhos: Record<string, string | string[]> = {};
        for (const [nome, valor] of Object.entries(bruta.headers)) {
          if (valor !== undefined) cabecalhos[nome.toLowerCase()] = valor;
        }
        resposta = { url: urlAtual, status: bruta.statusCode, cabecalhos, trechoDoCorpo };
      } catch (erro) {
        const bloqueio = encontrarBloqueioDeEndereco(erro);
        if (bloqueio !== null) return bloquear(bloqueio.motivo);
        const falha = descreverFalha(erro, url.host);
        registrar(pedido, { metodo, url: urlAtual, decisao: 'PERMITIDA', motivo: decisao.motivo, status: null });
        throw falha;
      }

      registrar(pedido, { metodo, url: urlAtual, decisao: 'PERMITIDA', motivo: decisao.motivo, status: resposta.status });

      const local = resposta.cabecalhos['location'];
      const destino = Array.isArray(local) ? local[0] : local;
      if (!STATUS_DE_REDIRECIONAMENTO.has(resposta.status) || destino === undefined) return resposta;

      // Redirecionamento manual: o próximo salto passa de novo por todas as regras.
      let proximo: string;
      try {
        proximo = new URL(destino, urlAtual).toString();
      } catch {
        proximo = destino;
      }
      if (!politica.seguirRedirecionamentos) {
        registrar(pedido, {
          metodo: 'GET',
          url: proximo,
          decisao: 'BLOQUEADA',
          motivo: 'Redirecionamento não permitido nesta requisição',
          status: null,
        });
        throw new RequisicaoBloqueada('Redirecionamento não permitido nesta requisição');
      }
      origemDoSalto = urlAtual;
      urlAtual = proximo;
      metodo = 'GET';
      corpo = undefined;
    }
  }

  const politicaDeEscopo = (pedido: PedidoHttp): Politica => ({
    agente: agenteDeAvaliacao,
    metodoEfetivo: (metodo) => metodo.toUpperCase(),
    inicial: (url, metodo) =>
      avaliarRequisicao({ url, metodo, perfil: pedido.perfil, escopo: pedido.escopo }),
    salto: (origem, destino, saltos) =>
      avaliarRedirecionamento({
        origem,
        destino,
        saltos,
        maximoDeSaltos: MAXIMO_DE_REDIRECIONAMENTOS,
        escopo: pedido.escopo,
        perfil: pedido.perfil,
      }),
    aceitaCorpo: (metodo) => metodo !== 'GET' && metodo !== 'HEAD',
    seguirRedirecionamentos: true,
  });

  const politicaDeWebhook: Politica = {
    agente: agenteDeWebhook,
    metodoEfetivo: () => 'POST',
    inicial: (url) => {
      let analisada: URL;
      try {
        analisada = new URL(url);
      } catch {
        return negar('URL inválida');
      }
      if (analisada.protocol !== 'https:' && !(analisada.protocol === 'http:' && !exigirHttps)) {
        return negar('Webhooks exigem https');
      }
      return { permitida: true, motivo: 'Entrega de webhook para host público' };
    },
    salto: () => negar('Redirecionamento não permitido em entregas de webhook'),
    aceitaCorpo: () => true,
    seguirRedirecionamentos: false,
  };

  return {
    requisitar: (pedido) => executar(pedido, politicaDeEscopo(pedido)),
    requisitarWebhook: (pedido) =>
      executar(
        {
          url: pedido.url,
          metodo: 'POST',
          corpo: pedido.corpo,
          ...(pedido.cabecalhos ? { cabecalhos: pedido.cabecalhos } : {}),
          ...(pedido.aoDecidir ? { aoDecidir: pedido.aoDecidir } : {}),
        },
        politicaDeWebhook,
      ),
    fechar: async () => {
      await Promise.allSettled([agenteDeAvaliacao.close(), agenteDeWebhook.close()]);
    },
  };
}
