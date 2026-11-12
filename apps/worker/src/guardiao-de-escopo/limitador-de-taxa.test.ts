import { describe, expect, it } from 'vitest';
import { LimitadorDeTaxa } from './limitador-de-taxa';

describe('LimitadorDeTaxa', () => {
  it('permite rajada até o limite e depois manda esperar', () => {
    let agora = 1_000;
    const limitador = new LimitadorDeTaxa(2, () => agora);
    expect(limitador.reservar('a.net')).toBe(0);
    expect(limitador.reservar('a.net')).toBe(0);
    expect(limitador.reservar('a.net')).toBe(500);
    expect(limitador.reservar('a.net')).toBe(1000);
    agora += 2_000;
    expect(limitador.reservar('a.net')).toBe(0);
  });

  it('repõe fichas com o passar do tempo', () => {
    let agora = 0;
    const limitador = new LimitadorDeTaxa(5, () => agora);
    for (let i = 0; i < 5; i++) limitador.reservar('a.net');
    expect(limitador.reservar('a.net')).toBe(200);
    agora += 200;
    expect(limitador.reservar('a.net')).toBe(200);
  });

  it('mantém um balde por host', () => {
    const limitador = new LimitadorDeTaxa(1, () => 0);
    expect(limitador.reservar('a.net')).toBe(0);
    expect(limitador.reservar('b.net')).toBe(0);
    expect(limitador.reservar('a.net')).toBe(1000);
  });

  it('rejeita taxa inválida', () => {
    expect(() => new LimitadorDeTaxa(0)).toThrow(RangeError);
  });
});
