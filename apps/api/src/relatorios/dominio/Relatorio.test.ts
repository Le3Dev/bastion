import { describe, expect, it } from 'vitest';
import { ErroDeDominio, type Severidade } from '@bastion/dominio-compartilhado';
import type { EstadoDoAchado } from '../../achados/dominio/EstadoDoAchado';
import { MapeamentoDeConformidade } from './MapeamentoDeConformidade';
import { NotaDeSeguranca } from './NotaDeSeguranca';
import { Relatorio, type AchadoDoRelatorio } from './Relatorio';

const T0 = new Date('2026-01-01T10:00:00Z');

const achado = (
  severidade: Severidade,
  estado: EstadoDoAchado = 'NOVO',
  owasp: string[] = [],
  lgpd: string[] = [],
  id = `${severidade}-${estado}-${owasp.join('')}`,
): AchadoDoRelatorio => ({ id, titulo: `Achado ${severidade}`, severidade, estado, conformidade: { owasp, lgpd } });

describe('NotaDeSeguranca', () => {
  it('usa os pesos 25, 10, 4 e 1', () => {
    expect(NotaDeSeguranca.calcular([achado('CRITICA')]).valor).toBe(75);
    expect(NotaDeSeguranca.calcular([achado('ALTA')]).valor).toBe(90);
    expect(NotaDeSeguranca.calcular([achado('MEDIA')]).valor).toBe(96);
    expect(NotaDeSeguranca.calcular([achado('BAIXA')]).valor).toBe(99);
  });

  it('é 100 sem achados e nunca fica abaixo de 0', () => {
    expect(NotaDeSeguranca.calcular([]).valor).toBe(100);
    const muitos = Array.from({ length: 10 }, () => achado('CRITICA'));
    expect(NotaDeSeguranca.calcular(muitos).valor).toBe(0);
  });

  it('ignora achados corrigidos e com risco aceito', () => {
    const nota = NotaDeSeguranca.calcular([
      achado('CRITICA', 'CORRIGIDO'),
      achado('CRITICA', 'RISCO_ACEITO'),
      achado('ALTA', 'REABERTO'),
    ]);
    expect(nota.valor).toBe(90);
  });

  it('classifica as faixas nos limites', () => {
    expect(NotaDeSeguranca.reconstituir(100).faixa).toBe('BOA');
    expect(NotaDeSeguranca.reconstituir(80).faixa).toBe('BOA');
    expect(NotaDeSeguranca.reconstituir(79).faixa).toBe('ATENCAO');
    expect(NotaDeSeguranca.reconstituir(50).faixa).toBe('ATENCAO');
    expect(NotaDeSeguranca.reconstituir(49).faixa).toBe('CRITICA');
    expect(NotaDeSeguranca.reconstituir(0).faixa).toBe('CRITICA');
  });
});

describe('MapeamentoDeConformidade', () => {
  it('conta códigos em ordem decrescente e ignora repetição dentro do mesmo achado', () => {
    const mapa = MapeamentoDeConformidade.agregar([
      achado('ALTA', 'NOVO', ['A05', 'A02', 'A05'], ['Art. 46']),
      achado('MEDIA', 'NOVO', ['A05'], [], 'x'),
      achado('BAIXA', 'NOVO', ['A02', 'A09'], ['Art. 46', 'Art. 6'], 'y'),
    ]);
    expect(mapa.owasp).toEqual([
      { codigo: 'A05', quantidade: 2 },
      { codigo: 'A02', quantidade: 2 },
      { codigo: 'A09', quantidade: 1 },
    ].sort((a, b) => b.quantidade - a.quantidade || a.codigo.localeCompare(b.codigo)));
    expect(mapa.lgpd).toEqual([
      { codigo: 'Art. 46', quantidade: 2 },
      { codigo: 'Art. 6', quantidade: 1 },
    ]);
  });

  it('devolve listas vazias sem achados', () => {
    const mapa = MapeamentoDeConformidade.agregar([]);
    expect(mapa.owasp).toEqual([]);
    expect(mapa.lgpd).toEqual([]);
  });
});

describe('Relatorio.gerar', () => {
  const gerar = (achados: AchadoDoRelatorio[], notaMinima = 70): Relatorio =>
    Relatorio.gerar(
      {
        id: 'rel-1',
        organizacaoId: 'org-1',
        avaliacaoId: 'av-1',
        sistemaId: 'sis-1',
        sistemaNome: 'Loja Online',
        notaMinima,
        achados,
      },
      T0,
    );

  it('calcula nota, aprovação, conformidade e emite RelatorioGerado', () => {
    const r = gerar([achado('ALTA', 'NOVO', ['A05'], ['Art. 46']), achado('MEDIA', 'NOVO', ['A05'], [], 'm')]);
    const dados = r.paraDados();
    expect(dados.nota).toBe(86);
    expect(dados.aprovado).toBe(true);
    expect(dados.contagemPorSeveridade).toEqual({ CRITICA: 0, ALTA: 1, MEDIA: 1, BAIXA: 0 });
    expect(dados.conformidade.owasp).toEqual([{ codigo: 'A05', quantidade: 2 }]);
    expect(dados.geradoEm).toEqual(T0);
    const eventos = r.puxarEventos();
    expect(eventos.map((e) => e.tipo)).toEqual(['RelatorioGerado']);
    expect(eventos[0]?.dados).toMatchObject({ nota: 86, aprovado: true, relatorioId: 'rel-1' });
    expect(r.puxarEventos()).toEqual([]);
  });

  it('reprova quando a nota fica abaixo da mínima', () => {
    const r = gerar([achado('CRITICA'), achado('CRITICA', 'NOVO', [], [], 'c2')], 70);
    expect(r.aprovado).toBe(false);
    expect(r.paraDados().nota).toBe(50);
  });

  it('gera resumo executivo em português', () => {
    const aprovado = gerar([achado('ALTA'), achado('BAIXA', 'NOVO', [], [], 'b1'), achado('BAIXA', 'NOVO', [], [], 'b2')]);
    expect(aprovado.resumo).toContain('Loja Online');
    expect(aprovado.resumo).toContain('nota 88');
    expect(aprovado.resumo).toContain('aprovado');
    expect(aprovado.resumo).toContain('1 de severidade alta');
    expect(aprovado.resumo).toContain('2 de severidade baixa');

    const reprovado = gerar([achado('CRITICA'), achado('CRITICA', 'NOVO', [], [], 'c2'), achado('CRITICA', 'NOVO', [], [], 'c3')]);
    expect(reprovado.resumo).toContain('reprovado');
    expect(reprovado.resumo).toContain('3 críticos');
  });

  it('resumo sem achados em aberto', () => {
    const r = gerar([achado('CRITICA', 'CORRIGIDO')]);
    expect(r.paraDados().nota).toBe(100);
    expect(r.resumo).toContain('Nenhum achado em aberto');
  });

  it('rejeita nota mínima inválida', () => {
    expect(() => gerar([], 101)).toThrowError(ErroDeDominio);
  });

  it('reconstitui sem eventos', () => {
    const r = gerar([achado('ALTA')]);
    const copia = Relatorio.reconstituir(r.paraDados());
    expect(copia.paraDados()).toEqual(r.paraDados());
    expect(copia.puxarEventos()).toEqual([]);
  });
});
