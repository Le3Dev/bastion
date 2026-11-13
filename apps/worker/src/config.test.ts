import { describe, expect, it, vi } from 'vitest';
import { lerConfig } from './config';

describe('lerConfig', () => {
  it('aplica os padrões', () => {
    const avisar = vi.fn();
    expect(lerConfig({ REDIS_URL: 'redis://localhost:6379' }, avisar)).toEqual({
      redisUrl: 'redis://localhost:6379',
      permitirRedesPrivadas: false,
      requisicoesPorSegundo: 5,
      concorrenciaDeAvaliacoes: 2,
      portaDeSaude: 3334,
    });
    expect(avisar).not.toHaveBeenCalled();
  });

  it('avisa quando redes privadas estão liberadas', () => {
    const avisar = vi.fn();
    const config = lerConfig(
      {
        REDIS_URL: 'redis://x',
        GUARDIAO_PERMITIR_REDES_PRIVADAS: 'true',
        GUARDIAO_REQUISICOES_POR_SEGUNDO: '10',
        WORKER_CONCORRENCIA_AVALIACOES: '4',
      },
      avisar,
    );
    expect(config.permitirRedesPrivadas).toBe(true);
    expect(config.requisicoesPorSegundo).toBe(10);
    expect(config.concorrenciaDeAvaliacoes).toBe(4);
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('Apenas desenvolvimento'));
  });

  it('explica o que falta', () => {
    expect(() => lerConfig({})).toThrow(/REDIS_URL/);
    expect(() => lerConfig({ REDIS_URL: 'redis://x', GUARDIAO_PERMITIR_REDES_PRIVADAS: 'talvez' })).toThrow(
      /GUARDIAO_PERMITIR_REDES_PRIVADAS/,
    );
  });
});
