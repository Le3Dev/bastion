import { describe, expect, it } from 'vitest';
import { LIMITES_DO_PLANO, PoliticaDeLimitesDoPlano } from './PoliticaDeLimitesDoPlano';

const codigoDe = (fn: () => void): unknown => {
  try {
    fn();
  } catch (erro) {
    return (erro as { codigo?: unknown }).codigo;
  }
  return undefined;
};

describe('PoliticaDeLimitesDoPlano', () => {
  it('permite abaixo do limite e bloqueia no limite', () => {
    expect(codigoDe(() => PoliticaDeLimitesDoPlano.exigirPodeCadastrarSistema(9))).toBeUndefined();
    expect(codigoDe(() => PoliticaDeLimitesDoPlano.exigirPodeCadastrarSistema(10))).toBe('LIMITE_DO_PLANO');
    expect(codigoDe(() => PoliticaDeLimitesDoPlano.exigirPodeSolicitarAvaliacao(99))).toBeUndefined();
    expect(codigoDe(() => PoliticaDeLimitesDoPlano.exigirPodeSolicitarAvaliacao(100))).toBe('LIMITE_DO_PLANO');
    expect(codigoDe(() => PoliticaDeLimitesDoPlano.exigirPodeConvidarMembro(9))).toBeUndefined();
    expect(codigoDe(() => PoliticaDeLimitesDoPlano.exigirPodeConvidarMembro(10))).toBe('LIMITE_DO_PLANO');
  });

  it('cabeAvaliacao não lança', () => {
    expect(PoliticaDeLimitesDoPlano.cabeAvaliacao(99)).toBe(true);
    expect(PoliticaDeLimitesDoPlano.cabeAvaliacao(LIMITES_DO_PLANO.avaliacoesPorMes)).toBe(false);
  });
});
