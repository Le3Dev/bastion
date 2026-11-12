import { describe, expect, it } from 'vitest';
import { etapasDoPerfil, perfilDisponivelNoMvp, tempoMaximoDeExecucaoMs } from './PerfilDeAvaliacao';

describe('PerfilDeAvaliacao', () => {
  it('só o passivo está disponível no MVP', () => {
    expect(perfilDisponivelNoMvp('PASSIVO')).toBe(true);
    expect(perfilDisponivelNoMvp('PADRAO')).toBe(false);
    expect(perfilDisponivelNoMvp('COMPLETO')).toBe(false);
  });

  it('tempo máximo por perfil', () => {
    expect(tempoMaximoDeExecucaoMs('PASSIVO')).toBe(10 * 60_000);
    expect(tempoMaximoDeExecucaoMs('PADRAO')).toBe(60 * 60_000);
    expect(tempoMaximoDeExecucaoMs('COMPLETO')).toBe(240 * 60_000);
  });

  it('etapas do passivo', () => {
    expect(etapasDoPerfil('PASSIVO')).toEqual([
      'Conferir propriedade e escopo',
      'Cabeçalhos de segurança',
      'TLS e certificado',
      'Flags de cookies',
      'Exposição de versão',
      'Análise e deduplicação',
    ]);
  });
});
