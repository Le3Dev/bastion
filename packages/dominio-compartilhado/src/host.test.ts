import { describe, expect, it } from 'vitest';
import { hostPertenceAoDominio, normalizarHost } from './host';

describe('normalizarHost', () => {
  it('remove porta, ponto final e usa minúsculas', () => {
    expect(normalizarHost('API.Loja.com.br.:8443')).toBe('api.loja.com.br');
    expect(normalizarHost('Loja.com.br.')).toBe('loja.com.br');
  });
});

describe('hostPertenceAoDominio', () => {
  it('aceita subdomínio e o próprio domínio', () => {
    expect(hostPertenceAoDominio('api.loja.com.br', 'loja.com.br')).toBe(true);
    expect(hostPertenceAoDominio('LOJA.com.br:443', 'loja.com.br')).toBe(true);
  });

  it('rejeita domínio que apenas contém o alvo no meio', () => {
    expect(hostPertenceAoDominio('loja.com.br.evil.com', 'loja.com.br')).toBe(false);
  });

  it('rejeita sufixo sem ponto de separação', () => {
    expect(hostPertenceAoDominio('outraloja.com.br', 'loja.com.br')).toBe(false);
  });
});
