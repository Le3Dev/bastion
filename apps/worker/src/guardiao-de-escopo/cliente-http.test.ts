import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  criarClienteHttp,
  RequisicaoBloqueada,
  TAMANHO_MAXIMO_DO_CORPO,
  type ClienteHttp,
  type DecisaoRegistrada,
} from './cliente-http';
import { LimitadorDeTaxa } from './limitador-de-taxa';

let servidor: Server;
let porta: number;
let conexoesRecebidas: number;
let clientes: ClienteHttp[];

beforeEach(async () => {
  conexoesRecebidas = 0;
  clientes = [];
  servidor = createServer((req: IncomingMessage, res) => {
    conexoesRecebidas++;
    const caminho = req.url ?? '/';
    if (caminho === '/ola') {
      res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
      res.setHeader('X-Teste', 'valor');
      res.end('olá');
    } else if (caminho === '/para-fora') {
      res.writeHead(302, { Location: 'http://fora-do-escopo.exemplo/segredo' });
      res.end();
    } else if (caminho === '/para-dentro') {
      res.writeHead(302, { Location: '/ola' });
      res.end();
    } else if (caminho === '/ciclo') {
      res.writeHead(302, { Location: '/ciclo' });
      res.end();
    } else if (caminho === '/grande') {
      res.end('x'.repeat(200 * 1024));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  porta = (servidor.address() as AddressInfo).port;
});

afterEach(async () => {
  await Promise.all(clientes.map((cliente) => cliente.fechar()));
  servidor.closeAllConnections();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
});

function novoCliente(permitirRedesPrivadas: boolean, decisoes: DecisaoRegistrada[] = []): ClienteHttp {
  const cliente = criarClienteHttp({
    permitirRedesPrivadas,
    limitador: new LimitadorDeTaxa(1000),
    aoDecidir: (decisao) => decisoes.push(decisao),
  });
  clientes.push(cliente);
  return cliente;
}

const escopo = (...hosts: string[]) => ({ hostsPermitidos: hosts, dominiosBloqueados: [] });

describe('cliente HTTP do Guardião de Escopo', () => {
  it('bloqueia antes de conectar quando redes privadas não são permitidas (IP literal)', async () => {
    const decisoes: DecisaoRegistrada[] = [];
    const cliente = novoCliente(false, decisoes);
    await expect(
      cliente.requisitar({
        url: `http://127.0.0.1:${porta}/ola`,
        metodo: 'GET',
        perfil: 'PASSIVO',
        escopo: escopo('127.0.0.1'),
      }),
    ).rejects.toBeInstanceOf(RequisicaoBloqueada);
    expect(conexoesRecebidas).toBe(0);
    expect(decisoes).toHaveLength(1);
    expect(decisoes[0]?.decisao).toBe('BLOQUEADA');
    expect(decisoes[0]?.status).toBeNull();
  });

  it('bloqueia antes de conectar quando o nome resolve para endereço privado (DNS)', async () => {
    const decisoes: DecisaoRegistrada[] = [];
    const cliente = novoCliente(false, decisoes);
    await expect(
      cliente.requisitar({
        url: `http://localhost:${porta}/ola`,
        metodo: 'GET',
        perfil: 'PASSIVO',
        escopo: escopo('localhost'),
      }),
    ).rejects.toBeInstanceOf(RequisicaoBloqueada);
    expect(conexoesRecebidas).toBe(0);
    expect(decisoes.at(-1)?.decisao).toBe('BLOQUEADA');
  });

  it('permite com redes privadas liberadas e devolve cabeçalhos em minúsculas e corpo', async () => {
    const decisoes: DecisaoRegistrada[] = [];
    const cliente = novoCliente(true, decisoes);
    const resposta = await cliente.requisitar({
      url: `http://127.0.0.1:${porta}/ola`,
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: escopo('127.0.0.1'),
    });
    expect(resposta.status).toBe(200);
    expect(resposta.trechoDoCorpo).toBe('olá');
    expect(resposta.cabecalhos['x-teste']).toBe('valor');
    expect(resposta.cabecalhos['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(decisoes).toEqual([
      expect.objectContaining({ decisao: 'PERMITIDA', metodo: 'GET', status: 200 }),
    ]);
  });

  it('chama o aoDecidir do pedido além do aoDecidir do cliente', async () => {
    const doPedido: DecisaoRegistrada[] = [];
    const doCliente: DecisaoRegistrada[] = [];
    const cliente = novoCliente(true, doCliente);
    await cliente.requisitar({
      url: `http://127.0.0.1:${porta}/ola`,
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: escopo('127.0.0.1'),
      aoDecidir: (decisao) => doPedido.push(decisao),
    });
    expect(doPedido).toHaveLength(1);
    expect(doCliente).toHaveLength(1);
  });

  it('bloqueia redirecionamento para host fora do escopo', async () => {
    const decisoes: DecisaoRegistrada[] = [];
    const cliente = novoCliente(true, decisoes);
    await expect(
      cliente.requisitar({
        url: `http://127.0.0.1:${porta}/para-fora`,
        metodo: 'GET',
        perfil: 'PASSIVO',
        escopo: escopo('127.0.0.1'),
      }),
    ).rejects.toThrow(/Redirecionamento bloqueado/);
    expect(decisoes.map((d) => d.decisao)).toEqual(['PERMITIDA', 'BLOQUEADA']);
    expect(decisoes[0]?.status).toBe(302);
    expect(decisoes[1]?.url).toBe('http://fora-do-escopo.exemplo/segredo');
    expect(conexoesRecebidas).toBe(1);
  });

  it('segue redirecionamento dentro do escopo e informa a URL final', async () => {
    const cliente = novoCliente(true);
    const resposta = await cliente.requisitar({
      url: `http://127.0.0.1:${porta}/para-dentro`,
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: escopo('127.0.0.1'),
    });
    expect(resposta.status).toBe(200);
    expect(resposta.url).toBe(`http://127.0.0.1:${porta}/ola`);
  });

  it('limita os redirecionamentos a 5', async () => {
    const cliente = novoCliente(true);
    await expect(
      cliente.requisitar({
        url: `http://127.0.0.1:${porta}/ciclo`,
        metodo: 'GET',
        perfil: 'PASSIVO',
        escopo: escopo('127.0.0.1'),
      }),
    ).rejects.toThrow(/Redirecionamentos em excesso/);
    expect(conexoesRecebidas).toBe(6);
  });

  it('recusa POST no perfil passivo sem conectar', async () => {
    const decisoes: DecisaoRegistrada[] = [];
    const cliente = novoCliente(true, decisoes);
    await expect(
      cliente.requisitar({
        url: `http://127.0.0.1:${porta}/ola`,
        metodo: 'POST',
        perfil: 'PASSIVO',
        escopo: escopo('127.0.0.1'),
        corpo: 'x=1',
      }),
    ).rejects.toThrow(/perfil passivo/);
    expect(conexoesRecebidas).toBe(0);
    expect(decisoes[0]).toEqual(expect.objectContaining({ decisao: 'BLOQUEADA', metodo: 'POST' }));
  });

  it('trunca o corpo em 64 KB', async () => {
    const cliente = novoCliente(true);
    const resposta = await cliente.requisitar({
      url: `http://127.0.0.1:${porta}/grande`,
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: escopo('127.0.0.1'),
    });
    expect(resposta.status).toBe(200);
    expect(resposta.trechoDoCorpo).toHaveLength(TAMANHO_MAXIMO_DO_CORPO);
  });

  it('informa falha de conexão com mensagem clara', async () => {
    const cliente = novoCliente(true);
    const livre = await new Promise<number>((resolver) => {
      const temporario = createServer();
      temporario.listen(0, '127.0.0.1', () => {
        const numero = (temporario.address() as AddressInfo).port;
        temporario.close(() => resolver(numero));
      });
    });
    await expect(
      cliente.requisitar({
        url: `http://127.0.0.1:${livre}/`,
        metodo: 'GET',
        perfil: 'PASSIVO',
        escopo: escopo('127.0.0.1'),
      }),
    ).rejects.toThrow(/Não foi possível conectar a 127\.0\.0\.1:\d+ \(ECONNREFUSED\)\./);
  });

  it('no modo webhook recusa http por padrão e IP privado', async () => {
    const cliente = novoCliente(false);
    await expect(
      cliente.requisitarWebhook({ url: `http://127.0.0.1:${porta}/ola`, corpo: '{}' }),
    ).rejects.toThrow(/exigem https/);
    await expect(
      cliente.requisitarWebhook({ url: `https://127.0.0.1:${porta}/ola`, corpo: '{}' }),
    ).rejects.toBeInstanceOf(RequisicaoBloqueada);
    expect(conexoesRecebidas).toBe(0);
  });
});
