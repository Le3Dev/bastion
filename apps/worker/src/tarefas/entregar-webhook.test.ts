import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  CABECALHO_ASSINATURA,
  CABECALHO_EVENTO_ID,
  CABECALHO_EVENTO_TIPO,
  type EventoDeResultado,
  type TarefaEntregarWebhook,
} from '@bastion/contratos';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarClienteHttp, type ClienteHttp } from '../guardiao-de-escopo/cliente-http';
import { LimitadorDeTaxa } from '../guardiao-de-escopo/limitador-de-taxa';
import type { DadosDoEvento } from '../resultados';
import { criarEntregadorDeWebhook } from './entregar-webhook';

let servidor: Server;
let porta: number;
let statusDaResposta: number;
let recebido: { metodo?: string; cabecalhos: IncomingHttpHeaders; corpo: string } | null;
let cliente: ClienteHttp;
let eventos: DadosDoEvento[];

beforeEach(async () => {
  statusDaResposta = 200;
  recebido = null;
  eventos = [];
  servidor = createServer((req, res) => {
    const pedacos: Buffer[] = [];
    req.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    req.on('end', () => {
      recebido = {
        ...(req.method ? { metodo: req.method } : {}),
        cabecalhos: req.headers,
        corpo: Buffer.concat(pedacos).toString('utf8'),
      };
      res.writeHead(statusDaResposta).end('ok');
    });
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  porta = (servidor.address() as AddressInfo).port;
  // O servidor local é http; a exigência de https é desligada só neste teste.
  cliente = criarClienteHttp({
    permitirRedesPrivadas: true,
    limitador: new LimitadorDeTaxa(1000),
    exigirHttpsNosWebhooks: false,
  });
});

afterEach(async () => {
  await cliente.fechar();
  servidor.closeAllConnections();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
});

const tarefa = (): TarefaEntregarWebhook => ({
  entregaId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  organizacaoId: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  url: `http://127.0.0.1:${porta}/hook`,
  corpo: '{"id":"1"}',
  assinatura: 'sha256=abc',
  eventoId: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  tipoDoEvento: 'avaliacao.concluida',
});

const entregador = () =>
  criarEntregadorDeWebhook({
    clienteHttp: cliente,
    publicador: {
      publicar: (dados) => {
        eventos.push(dados);
        return Promise.resolve({} as EventoDeResultado);
      },
    },
  });

describe('entrega de webhook', () => {
  it('envia POST com corpo e cabeçalhos e emite entrega-concluida com sucesso', async () => {
    await entregador().entregar(tarefa());
    expect(recebido?.metodo).toBe('POST');
    expect(recebido?.corpo).toBe('{"id":"1"}');
    expect(recebido?.cabecalhos['content-type']).toBe('application/json');
    expect(recebido?.cabecalhos[CABECALHO_ASSINATURA.toLowerCase()]).toBe('sha256=abc');
    expect(recebido?.cabecalhos[CABECALHO_EVENTO_ID.toLowerCase()]).toBe('c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
    expect(recebido?.cabecalhos[CABECALHO_EVENTO_TIPO.toLowerCase()]).toBe('avaliacao.concluida');
    expect(eventos).toEqual([
      expect.objectContaining({ tipo: 'entrega-concluida', sucesso: true, status: 200 }),
    ]);
  });

  it('emite sucesso=false e lança erro quando o destino responde 500', async () => {
    statusDaResposta = 500;
    await expect(entregador().entregar(tarefa())).rejects.toThrow(/HTTP 500/);
    expect(eventos).toEqual([
      expect.objectContaining({ tipo: 'entrega-concluida', sucesso: false, status: 500 }),
    ]);
  });

  it('emite sucesso=false com status nulo e lança erro quando não conecta', async () => {
    const t = { ...tarefa(), url: 'http://127.0.0.1:1/hook' };
    await expect(entregador().entregar(t)).rejects.toThrow();
    expect(eventos).toEqual([
      expect.objectContaining({ tipo: 'entrega-concluida', sucesso: false, status: null }),
    ]);
  });
});
