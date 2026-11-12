import { describe, expect, it } from 'vitest';
import { ChaveDeApi } from './ChaveDeApi';

const AGORA = new Date('2026-01-10T12:00:00Z');
const DEPOIS = new Date('2026-01-11T12:00:00Z');

const criar = (papel: 'ADMIN' | 'DONO' = 'ADMIN'): ChaveDeApi =>
  ChaveDeApi.criar(
    {
      id: 'k-1',
      organizacaoId: 'org-1',
      nome: 'CI',
      papel,
      prefixo: 'bst_abc123',
      hashDoSegredo: 'hash',
    },
    AGORA,
  );

describe('ChaveDeApi', () => {
  it('nasce ativa e emite ChaveDeApiCriada', () => {
    const chave = criar();
    expect(chave.estaAtiva).toBe(true);
    expect(chave.puxarEventos().map((e) => e.tipo)).toEqual(['ChaveDeApiCriada']);
  });

  it('não aceita o papel DONO', () => {
    expect(() => criar('DONO')).toThrow('DONO');
  });

  it('revoga e emite evento', () => {
    const chave = criar();
    chave.puxarEventos();
    chave.revogar(DEPOIS);
    expect(chave.estaAtiva).toBe(false);
    expect(chave.puxarEventos().map((e) => e.tipo)).toEqual(['ChaveDeApiRevogada']);
    expect(() => chave.revogar(DEPOIS)).toThrow('já foi revogada');
  });

  it('registra uso apenas enquanto ativa', () => {
    const chave = criar();
    chave.registrarUso(DEPOIS);
    expect(chave.paraDados().ultimoUsoEm).toEqual(DEPOIS);
    chave.revogar(DEPOIS);
    expect(() => chave.registrarUso(DEPOIS)).toThrow('revogada');
  });

  it('reconstitui a partir dos dados', () => {
    const chave = criar();
    expect(ChaveDeApi.reconstituir(chave.paraDados()).paraDados()).toEqual(chave.paraDados());
  });
});
