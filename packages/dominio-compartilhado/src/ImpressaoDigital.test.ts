import { describe, expect, it } from 'vitest';
import { ImpressaoDigital } from './ImpressaoDigital';

describe('ImpressaoDigital', () => {
  it('compõe sistema, tipo e local normalizado', () => {
    expect(ImpressaoDigital.de('s1', 'T', '  HTTPS://Loja.com/Api/ ').valor).toBe(
      's1:T:https://loja.com/api',
    );
  });

  it('é igual quando a normalização coincide', () => {
    expect(ImpressaoDigital.de('s1', 'T', 'A/').igualA(ImpressaoDigital.de('s1', 'T', 'a'))).toBe(true);
  });

  it('difere por sistema, tipo ou local', () => {
    const base = ImpressaoDigital.de('s1', 'T', 'a');
    expect(base.igualA(ImpressaoDigital.de('s2', 'T', 'a'))).toBe(false);
    expect(base.igualA(ImpressaoDigital.de('s1', 'U', 'a'))).toBe(false);
    expect(base.igualA(ImpressaoDigital.de('s1', 'T', 'b'))).toBe(false);
  });

  it('reconstitui a partir do valor', () => {
    const original = ImpressaoDigital.de('s1', 'T', 'a');
    expect(ImpressaoDigital.reconstituir(original.valor).igualA(original)).toBe(true);
  });
});
