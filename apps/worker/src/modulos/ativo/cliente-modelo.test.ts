import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { criarClienteModelo } from './cliente-modelo';

const CHAVE = 'sk-ant-segredo-123';
let servidor: Server | undefined;

async function subir(
  tratar: (req: IncomingMessage, corpo: string, res: import('node:http').ServerResponse) => void,
): Promise<string> {
  servidor = createServer((req, res) => {
    let corpo = '';
    req.on('data', (parte: Buffer) => (corpo += parte.toString()));
    req.on('end', () => tratar(req, corpo, res));
  });
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1/messages`;
}

afterEach(async () => {
  servidor?.closeAllConnections();
  await new Promise<void>((ok) => (servidor ? servidor.close(() => ok()) : ok()));
  servidor = undefined;
});

describe('criarClienteModelo', () => {
  it('envia modelo, mensagens e cabeçalhos e lê a resposta', async () => {
    let visto: { headers: IncomingMessage['headers']; corpo: unknown } | undefined;
    const url = await subir((req, corpo, res) => {
      visto = { headers: req.headers, corpo: JSON.parse(corpo) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ content: [{ type: 'text', text: '  olá  ' }] }));
    });
    const cliente = criarClienteModelo({ url, modelo: 'claude-sonnet-5-5', chave: CHAVE });
    const texto = await cliente.completar({
      sistema: 'sist',
      mensagens: [
        { papel: 'user', texto: 'a' },
        { papel: 'assistant', texto: 'b' },
      ],
    });
    expect(texto).toBe('olá');
    expect(visto?.headers['x-api-key']).toBe(CHAVE);
    expect(visto?.headers['anthropic-version']).toBe('2023-06-01');
    expect(visto?.corpo).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'sist',
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
    });
  });

  it('não vaza a chave em erro de status', async () => {
    const url = await subir((_req, _corpo, res) => {
      res.statusCode = 401;
      res.end(`chave inválida ${CHAVE}`);
    });
    const cliente = criarClienteModelo({ url, modelo: 'm', chave: CHAVE });
    const erro = await cliente.completar({ sistema: 's', mensagens: [] }).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('401');
    expect((erro as Error).message).not.toContain(CHAVE);
  });

  it('trata JSON inválido sem vazar a chave', async () => {
    const url = await subir((_req, _corpo, res) => res.end('nao-json'));
    const cliente = criarClienteModelo({ url, modelo: 'm', chave: CHAVE });
    const erro = await cliente.completar({ sistema: 's', mensagens: [] }).catch((e: Error) => e);
    expect((erro as Error).message).toMatch(/JSON/);
    expect((erro as Error).message).not.toContain(CHAVE);
  });

  it('respeita o timeout', async () => {
    const url = await subir(() => undefined);
    const cliente = criarClienteModelo({ url, modelo: 'm', chave: CHAVE, timeoutMs: 100 });
    const erro = await cliente.completar({ sistema: 's', mensagens: [] }).catch((e: Error) => e);
    expect((erro as Error).message).toMatch(/tempo limite/);
    expect((erro as Error).message).not.toContain(CHAVE);
  });

  it('não vaza a chave em falha de conexão', async () => {
    const cliente = criarClienteModelo({ url: 'http://127.0.0.1:1/v1/messages', modelo: 'm', chave: CHAVE });
    const erro = await cliente.completar({ sistema: 's', mensagens: [] }).catch((e: Error) => e);
    expect((erro as Error).message).not.toContain(CHAVE);
  });
});
