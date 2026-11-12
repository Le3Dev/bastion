import { describe, expect, it } from 'vitest';
import type { ResumoDeAchado } from '../infraestrutura/RepositorioDeAchados';
import {
  codificarCursorDeAchados,
  decodificarCursorDeAchados,
  montarPaginaDeAchados,
} from './cursor';

const ID = '3f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10';

const resumo = (id: string, minutos: number): ResumoDeAchado => ({
  id,
  sistemaId: ID,
  sistemaNome: 'Portal',
  titulo: 'Achado',
  tipo: 'CABECALHO_CSP_AUSENTE',
  severidade: 'ALTA',
  estado: 'NOVO',
  local: '/',
  ocorrencias: 1,
  ultimaVezEm: new Date(Date.UTC(2026, 0, 1, 0, minutos)),
});

describe('cursor de achados', () => {
  it('codifica e decodifica a posição em base64url', () => {
    const posicao = { posto: 1, ultimaVezEm: new Date('2026-03-01T10:00:00.000Z'), id: ID };
    const cursor = codificarCursorDeAchados(posicao);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursorDeAchados(cursor)).toEqual(posicao);
  });

  it('recusa cursor adulterado com 400', () => {
    for (const lixo of ['@@@', Buffer.from('{"p":9,"em":"x","id":"y"}').toString('base64url')]) {
      expect(() => decodificarCursorDeAchados(lixo)).toThrowError(/cursor/i);
    }
  });

  it('monta a página só quando sobra item além do limite', () => {
    const tres = [resumo(ID, 3), resumo('4f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10', 2), resumo('5f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10', 1)];
    const cheia = montarPaginaDeAchados(tres, 2);
    expect(cheia.itens).toHaveLength(2);
    expect(cheia.proximaPagina).not.toBeNull();
    const ultima = decodificarCursorDeAchados(cheia.proximaPagina as string);
    expect(ultima.id).toBe('4f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10');
    expect(ultima.posto).toBe(1);

    expect(montarPaginaDeAchados(tres.slice(0, 2), 2).proximaPagina).toBeNull();
  });
});
