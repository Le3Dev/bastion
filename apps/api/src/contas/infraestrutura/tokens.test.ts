import { describe, expect, it } from 'vitest';
import {
  gerarChaveDeApi,
  gerarTokenDeConvite,
  gerarTokenDeVerificacao,
  gerarTokenOpaco,
  hashesIguais,
  hashSha256,
  separarChaveDeApi,
  separarTokenDeConvite,
} from './tokens';

describe('tokens', () => {
  it('gera token opaco de 32 bytes em base64url, sempre diferente', () => {
    const a = gerarTokenOpaco();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gerarTokenOpaco()).not.toBe(a);
  });

  it('calcula SHA-256 hexadecimal determinístico', () => {
    expect(hashSha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('compara hashes em tempo constante, inclusive de tamanhos diferentes', () => {
    expect(hashesIguais(hashSha256('a'), hashSha256('a'))).toBe(true);
    expect(hashesIguais(hashSha256('a'), hashSha256('b'))).toBe(false);
    expect(hashesIguais('curto', hashSha256('a'))).toBe(false);
  });

  it('gera chave de API no formato bst_<prefixo8>_<segredo> e só guarda o hash', () => {
    const chave = gerarChaveDeApi();
    expect(chave.valorCompleto).toMatch(/^bst_[0-9a-f]{8}_.+$/);
    expect(chave.valorCompleto.startsWith(`${chave.prefixo}_`)).toBe(true);
    expect(chave.hashDoSegredo).toBe(hashSha256(chave.valorCompleto));
    const separada = separarChaveDeApi(chave.valorCompleto);
    expect(separada?.prefixo).toBe(chave.prefixo);
    expect(separada?.hash).toBe(chave.hashDoSegredo);
  });

  it('rejeita chave de API com formato inválido', () => {
    expect(separarChaveDeApi('qualquer-coisa')).toBeNull();
    expect(separarChaveDeApi('bst_zzzzzzzz_segredo')).toBeNull();
  });

  it('gera token de verificação com 32 caracteres hexadecimais', () => {
    expect(gerarTokenDeVerificacao()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('o token do convite carrega o id da organização', () => {
    const organizacaoId = '3f1a7c52-9d41-4b7e-8a52-0c1f6a2b9e10';
    const token = gerarTokenDeConvite(organizacaoId);
    const separado = separarTokenDeConvite(token);
    expect(separado?.organizacaoId).toBe(organizacaoId);
    expect(separado?.hash).toBe(hashSha256(token));
    expect(separarTokenDeConvite('sem-organizacao')).toBeNull();
  });
});
