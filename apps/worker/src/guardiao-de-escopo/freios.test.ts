import { describe, expect, it, vi } from 'vitest';
import { ErroDeRequisicao, type PedidoHttp, type RespostaHttp } from './cliente-http';
import { aplicarFreios, CircuitoDeFalhas, ErroDeFreio, MOTIVO_ALVO_INSTAVEL, MOTIVO_TETO_ATINGIDO } from './freios';

const pedido: PedidoHttp = {
  url: 'http://127.0.0.1/',
  metodo: 'GET',
  perfil: 'PADRAO',
  escopo: { hostsPermitidos: ['127.0.0.1'], dominiosBloqueados: [], metodosPermitidos: ['GET'] },
};
const resposta = (status: number): RespostaHttp => ({ url: pedido.url, status, cabecalhos: {}, trechoDoCorpo: '' });

describe('CircuitoDeFalhas', () => {
  it('abre após o limite de 5xx/429 seguidos e uma resposta boa zera a contagem', () => {
    const circuito = new CircuitoDeFalhas(3);
    circuito.registrarStatus(503);
    circuito.registrarStatus(429);
    circuito.registrarStatus(200);
    circuito.registrarStatus(500);
    circuito.registrarStatus(500);
    expect(circuito.aberto).toBe(false);
    circuito.registrarStatus(502);
    expect(circuito.aberto).toBe(true);
  });

  it('4xx comuns (404) não contam como instabilidade', () => {
    const circuito = new CircuitoDeFalhas(2);
    for (let i = 0; i < 10; i++) circuito.registrarStatus(404);
    expect(circuito.aberto).toBe(false);
  });
});

describe('aplicarFreios', () => {
  it('interrompe ao atingir o teto de requisições', async () => {
    const cliente = { requisitar: vi.fn(() => Promise.resolve(resposta(200))) };
    const freios = aplicarFreios(cliente, { tetoDeRequisicoes: 2, circuito: new CircuitoDeFalhas() });
    await freios.requisitar(pedido);
    await freios.requisitar(pedido);
    await expect(freios.requisitar(pedido)).rejects.toThrow(MOTIVO_TETO_ATINGIDO);
    await expect(freios.requisitar(pedido)).rejects.toBeInstanceOf(ErroDeFreio);
    expect(cliente.requisitar).toHaveBeenCalledTimes(2);
    expect(freios.requisicoes()).toBe(2);
  });

  it('aborta quando o alvo responde só 5xx em sequência', async () => {
    const cliente = { requisitar: vi.fn(() => Promise.resolve(resposta(503))) };
    const freios = aplicarFreios(cliente, { tetoDeRequisicoes: 100, circuito: new CircuitoDeFalhas(10) });
    for (let i = 0; i < 9; i++) await freios.requisitar(pedido);
    await expect(freios.requisitar(pedido)).rejects.toThrow(MOTIVO_ALVO_INSTAVEL);
    expect(cliente.requisitar).toHaveBeenCalledTimes(10);
    await expect(freios.requisitar(pedido)).rejects.toThrow(MOTIVO_ALVO_INSTAVEL);
    expect(cliente.requisitar).toHaveBeenCalledTimes(10);
  });

  it('falhas de rede seguidas também abrem o disjuntor', async () => {
    const cliente = { requisitar: vi.fn(() => Promise.reject(new ErroDeRequisicao('sem conexão', 'ECONNREFUSED'))) };
    const freios = aplicarFreios(cliente, { tetoDeRequisicoes: 100, circuito: new CircuitoDeFalhas(3) });
    await expect(freios.requisitar(pedido)).rejects.toBeInstanceOf(ErroDeRequisicao);
    await expect(freios.requisitar(pedido)).rejects.toBeInstanceOf(ErroDeRequisicao);
    await expect(freios.requisitar(pedido)).rejects.toBeInstanceOf(ErroDeFreio);
  });

  it('chama o gancho antes de cada requisição (cancelamento/tempo)', async () => {
    const cliente = { requisitar: vi.fn(() => Promise.resolve(resposta(200))) };
    const antes = vi.fn(() => Promise.reject(new Error('cancelada')));
    const freios = aplicarFreios(cliente, { tetoDeRequisicoes: 5, circuito: new CircuitoDeFalhas(), antes });
    await expect(freios.requisitar(pedido)).rejects.toThrow('cancelada');
    expect(cliente.requisitar).not.toHaveBeenCalled();
  });
});
