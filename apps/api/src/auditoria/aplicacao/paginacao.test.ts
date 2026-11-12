import { describe, expect, it } from 'vitest';
import { ErroDeAplicacao } from '../../compartilhado/erros';
import { codificarCursor, decodificarCursor, montarPagina } from './paginacao';

const ID = '3f1a7c52-9d41-4b7e-8a52-0c1f6a2b9e10';

describe('paginação por cursor', () => {
  it('codifica e decodifica a data e o id em base64url', () => {
    const em = new Date('2026-11-12T10:00:00.123Z');
    const cursor = codificarCursor({ em, id: ID });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursor(cursor)).toEqual({ em, id: ID });
  });

  it('recusa cursor malformado com 400', () => {
    for (const ruim of ['%%%', Buffer.from('{}').toString('base64url'), codificarCursorRuim()]) {
      try {
        decodificarCursor(ruim);
        expect.unreachable('deveria ter lançado');
      } catch (erro) {
        expect(erro).toBeInstanceOf(ErroDeAplicacao);
        expect((erro as ErroDeAplicacao).status).toBe(400);
        expect((erro as ErroDeAplicacao).codigo).toBe('CURSOR_INVALIDO');
      }
    }
  });

  it('corta a página e aponta o cursor para o último item devolvido', () => {
    const itens = [1, 2, 3].map((n) => ({ em: new Date(2026, 0, n), id: `${n}` }));
    const pagina = montarPagina(itens, 2, (i) => i);
    expect(pagina.itens).toHaveLength(2);
    expect(pagina.proximaPagina).toBe(codificarCursor({ em: itens[1]!.em, id: '2' }));
  });

  it('não devolve cursor na última página', () => {
    const itens = [1, 2].map((n) => ({ em: new Date(2026, 0, n), id: `${n}` }));
    expect(montarPagina(itens, 2, (i) => i).proximaPagina).toBeNull();
    expect(montarPagina([], 2, (i: { em: Date; id: string }) => i).proximaPagina).toBeNull();
  });
});

function codificarCursorRuim(): string {
  return Buffer.from(JSON.stringify({ em: 'não é data', id: ID })).toString('base64url');
}
