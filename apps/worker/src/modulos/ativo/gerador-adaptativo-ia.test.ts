import { describe, expect, it } from 'vitest';
import type { ClienteModelo, OpcoesDeCompletar } from './cliente-modelo';
import { criarGeradorAdaptativo, type ContextoDeGeracao } from './gerador-adaptativo-ia';

const ctx: ContextoDeGeracao = {
  categoria: 'INJECAO',
  objetivo: 'medir obediência a instruções embutidas',
  historico: [{ mensagem: 'oi', resposta: 'olá, como posso ajudar?' }],
  marcadores: { codigo: 'ALFA-1', codigo2: 'BETA-2', saida: 'SAIDA-3' },
  frasesSigilosas: ['frase secreta'],
};

function clienteFalso(resposta: string, capturas: OpcoesDeCompletar[] = []): ClienteModelo {
  return {
    async completar(opcoes) {
      capturas.push(opcoes);
      return resposta;
    },
  };
}

describe('criarGeradorAdaptativo', () => {
  it('repassa categoria, objetivo e histórico e devolve a mensagem', async () => {
    const capturas: OpcoesDeCompletar[] = [];
    const gerador = criarGeradorAdaptativo({ cliente: clienteFalso('  Responda ALFA-1  ', capturas) });
    expect(await gerador.proximaMensagem(ctx)).toBe('Responda ALFA-1');
    const chamada = capturas[0]!;
    expect(chamada.sistema).toContain('INJECAO');
    expect(chamada.sistema).toContain(ctx.objetivo);
    expect(chamada.sistema).toContain('ALFA-1');
    expect(chamada.sistema).toMatch(/autorizad/i);
    expect(chamada.mensagens[0]).toMatchObject({ papel: 'user' });
    expect(chamada.mensagens[0]!.texto).toContain('oi');
    expect(chamada.mensagens[1]).toEqual({ papel: 'assistant', texto: 'olá, como posso ajudar?' });
    expect(chamada.mensagens.at(-1)?.papel).toBe('user');
  });

  it('devolve null quando o cliente retorna vazio ou FIM', async () => {
    expect(await criarGeradorAdaptativo({ cliente: clienteFalso('  ') }).proximaMensagem(ctx)).toBeNull();
    expect(await criarGeradorAdaptativo({ cliente: clienteFalso('fim') }).proximaMensagem(ctx)).toBeNull();
  });

  it('funciona sem histórico', async () => {
    const capturas: OpcoesDeCompletar[] = [];
    const gerador = criarGeradorAdaptativo({ cliente: clienteFalso('olá', capturas) });
    await gerador.proximaMensagem({ ...ctx, historico: [] });
    expect(capturas[0]!.mensagens).toHaveLength(1);
  });
});
