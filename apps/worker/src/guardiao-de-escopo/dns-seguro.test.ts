import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';
import { avaliarHostLiteral, criarLookupSeguro, ErroDeEnderecoBloqueado } from './dns-seguro';

const resolverPara = (...enderecos: LookupAddress[]) => () => Promise.resolve(enderecos);

function consultar(
  lookup: ReturnType<typeof criarLookupSeguro>,
  todos: boolean,
): Promise<{ erro: Error | null; endereco: unknown }> {
  return new Promise((resolver) => {
    lookup('exemplo.com', { all: todos }, (erro, endereco) => resolver({ erro, endereco }));
  });
}

describe('lookup seguro', () => {
  it('entrega todos os endereços quando todos são públicos', async () => {
    const lookup = criarLookupSeguro({
      permitirRedesPrivadas: false,
      resolver: resolverPara({ address: '93.184.216.34', family: 4 }),
    });
    const { erro, endereco } = await consultar(lookup, true);
    expect(erro).toBeNull();
    expect(endereco).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('rejeita se QUALQUER endereço for proibido (DNS rebinding)', async () => {
    const lookup = criarLookupSeguro({
      permitirRedesPrivadas: false,
      resolver: resolverPara({ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }),
    });
    const { erro } = await consultar(lookup, true);
    expect(erro).toBeInstanceOf(ErroDeEnderecoBloqueado);
  });

  it('nunca libera metadados de nuvem, mesmo com redes privadas liberadas', async () => {
    const lookup = criarLookupSeguro({
      permitirRedesPrivadas: true,
      resolver: resolverPara({ address: '169.254.169.254', family: 4 }),
    });
    const { erro } = await consultar(lookup, false);
    expect(erro).toBeInstanceOf(ErroDeEnderecoBloqueado);
  });

  it('avalia IP literal fora do lookup', () => {
    expect(avaliarHostLiteral('exemplo.com', { permitirRedesPrivadas: false })).toBeNull();
    expect(avaliarHostLiteral('[::1]', { permitirRedesPrivadas: false })?.permitido).toBe(false);
    expect(avaliarHostLiteral('127.0.0.1', { permitirRedesPrivadas: true })?.permitido).toBe(true);
  });
});
