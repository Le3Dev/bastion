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
      iaAdaptativoAtivo: false,
      iaProvedorUrl: 'https://api.anthropic.com/v1/messages',
      iaProvedorModelo: 'claude-sonnet-5-5',
      iaProvedorChave: '',
      iaAdaptativoOrcamento: 12,
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

  it('lê a configuração do modo adaptativo e avisa se faltar chave', () => {
    const avisar = vi.fn();
    const sem = lerConfig({ REDIS_URL: 'redis://x', IA_ADAPTATIVO_ATIVO: 'true' }, avisar);
    expect(sem.iaAdaptativoAtivo).toBe(true);
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining('IA_PROVEDOR_CHAVE'));

    const cheio = lerConfig(
      {
        REDIS_URL: 'redis://x',
        IA_ADAPTATIVO_ATIVO: 'true',
        IA_PROVEDOR_URL: 'http://proxy/v1/messages',
        IA_PROVEDOR_MODELO: 'outro',
        IA_PROVEDOR_CHAVE: 'k',
        IA_ADAPTATIVO_ORCAMENTO: '5',
      },
      vi.fn(),
    );
    expect(cheio).toMatchObject({
      iaProvedorUrl: 'http://proxy/v1/messages',
      iaProvedorModelo: 'outro',
      iaProvedorChave: 'k',
      iaAdaptativoOrcamento: 5,
    });
    expect(() => lerConfig({ REDIS_URL: 'redis://x', IA_ADAPTATIVO_ORCAMENTO: '41' })).toThrow(/IA_ADAPTATIVO_ORCAMENTO/);
  });

  it('explica o que falta', () => {
    expect(() => lerConfig({})).toThrow(/REDIS_URL/);
    expect(() => lerConfig({ REDIS_URL: 'redis://x', GUARDIAO_PERMITIR_REDES_PRIVADAS: 'talvez' })).toThrow(
      /GUARDIAO_PERMITIR_REDES_PRIVADAS/,
    );
  });
});
