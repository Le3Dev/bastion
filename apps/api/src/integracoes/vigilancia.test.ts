import { describe, expect, it, vi } from 'vitest';
import { idDaVigilancia } from './filas';
import { tratarVigilancia, type AlvosDaVigilancia } from './vigilancia';

const alvosFalsos = () => {
  const alvos = {
    verificarTempoLimiteDaAvaliacao: vi.fn<AlvosDaVigilancia['verificarTempoLimiteDaAvaliacao']>(async () => {}),
    verificarVencimentoDoRisco: vi.fn<AlvosDaVigilancia['verificarVencimentoDoRisco']>(async () => {}),
  };
  return alvos;
};

describe('tratarVigilancia', () => {
  it('despacha o tempo limite da avaliação', async () => {
    const alvos = alvosFalsos();
    await tratarVigilancia(alvos, { tipo: 'tempo-limite-da-avaliacao', avaliacaoId: 'a1', organizacaoId: 'o1' });
    expect(alvos.verificarTempoLimiteDaAvaliacao).toHaveBeenCalledWith('o1', 'a1');
    expect(alvos.verificarVencimentoDoRisco).not.toHaveBeenCalled();
  });

  it('despacha o vencimento do risco', async () => {
    const alvos = alvosFalsos();
    await tratarVigilancia(alvos, { tipo: 'vencimento-do-risco', achadoId: 'x1', organizacaoId: 'o1' });
    expect(alvos.verificarVencimentoDoRisco).toHaveBeenCalledWith('o1', 'x1');
  });

  it('rejeita tarefa desconhecida', async () => {
    await expect(tratarVigilancia(alvosFalsos(), { tipo: 'outra' })).rejects.toThrow();
  });
});

describe('idDaVigilancia', () => {
  it('é determinístico por tarefa e atraso, e não usa dois-pontos (proibido no BullMQ)', () => {
    const tarefa = { tipo: 'tempo-limite-da-avaliacao', avaliacaoId: 'a1', organizacaoId: 'o1' } as const;
    expect(idDaVigilancia(tarefa, 1200000)).toBe(idDaVigilancia(tarefa, 1200000));
    expect(idDaVigilancia(tarefa, 1200000)).not.toBe(idDaVigilancia(tarefa, 660000));
    expect(idDaVigilancia(tarefa, 1200000)).not.toContain(':');
  });
});
