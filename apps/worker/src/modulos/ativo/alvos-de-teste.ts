import type { EscopoDaTarefa } from '@bastion/contratos';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { criarClienteHttp, type ClienteHttp, type DecisaoRegistrada } from '../../guardiao-de-escopo/cliente-http';
import { LimitadorDeTaxa } from '../../guardiao-de-escopo/limitador-de-taxa';
import { criarContexto, type ContextoAtivo } from './comum';

/** Só para testes: servidores locais que imitam alvos saudáveis e vulneráveis. */
export interface AlvoLocal {
  url: string;
  porta: number;
  /** Método e caminho (com consulta) de cada requisição recebida. */
  pedidos: string[];
  fechar(): Promise<void>;
}

type Manipulador = (req: IncomingMessage, res: ServerResponse, corpo: string) => void;

export async function servir(manipulador: Manipulador): Promise<AlvoLocal> {
  const pedidos: string[] = [];
  const servidor = createServer((req, res) => {
    pedidos.push(`${req.method ?? 'GET'} ${req.url ?? '/'}`);
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => manipulador(req, res, Buffer.concat(partes).toString('utf8')));
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const porta = (servidor.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${porta}`,
    porta,
    pedidos,
    fechar: async () => {
      servidor.closeAllConnections();
      await new Promise<void>((resolver) => servidor.close(() => resolver()));
    },
  };
}

export const html = (res: ServerResponse, corpo: string, status = 200): void => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(corpo);
};

export const escapar = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function escopoDeTeste(sobrescritas: Partial<EscopoDaTarefa> = {}): EscopoDaTarefa {
  return {
    hostsPermitidos: ['127.0.0.1'],
    dominiosBloqueados: [],
    requisicoesPorSegundo: 50,
    tempoMaximoMs: 600_000,
    metodosPermitidos: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    caminhosExcluidos: [],
    tetoDeRequisicoes: 5_000,
    permitirCriacaoDeDados: false,
    ...sobrescritas,
  };
}

export interface AmbienteDeTeste {
  contexto: ContextoAtivo;
  cliente: ClienteHttp;
  decisoes: DecisaoRegistrada[];
}

export function criarAmbiente(sobrescritas: Partial<EscopoDaTarefa> = {}): AmbienteDeTeste {
  const decisoes: DecisaoRegistrada[] = [];
  const cliente = criarClienteHttp({ permitirRedesPrivadas: true, limitador: new LimitadorDeTaxa(100_000) });
  const contexto = criarContexto({
    clienteHttp: cliente,
    perfil: 'COMPLETO',
    escopo: escopoDeTeste(sobrescritas),
    limitador: new LimitadorDeTaxa(100_000),
    aoDecidir: (decisao) => decisoes.push(decisao),
  });
  return { contexto, cliente, decisoes };
}
