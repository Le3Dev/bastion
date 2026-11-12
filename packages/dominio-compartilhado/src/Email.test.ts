import { describe, expect, it } from 'vitest';
import { Email } from './Email';
import { ErroDeDominio } from './ErroDeDominio';

describe('Email', () => {
  it('normaliza com trim e minúsculas', () => {
    expect(Email.criar('  Ana@Loja.COM ').valor).toBe('ana@loja.com');
  });

  it('rejeita e-mail inválido com código', () => {
    expect(() => Email.criar('sem-arroba')).toThrowError(ErroDeDominio);
    try {
      Email.criar('x@y');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeDominio);
      expect((erro as ErroDeDominio).codigo).toBe('EMAIL_INVALIDO');
    }
  });

  it('compara por valor', () => {
    expect(Email.criar('a@b.com').igualA(Email.criar('A@B.com'))).toBe(true);
    expect(Email.criar('a@b.com').igualA(Email.criar('c@b.com'))).toBe(false);
  });
});
