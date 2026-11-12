import { describe, expect, it } from 'vitest';
import { AgendamentoDeAvaliacao, type DadosParaCriarAgendamento } from './AgendamentoDeAvaliacao';

const AGORA = new Date('2026-01-10T12:00:00Z');

const base = (o: Partial<DadosParaCriarAgendamento> = {}): DadosParaCriarAgendamento => ({
  id: 'a-1',
  organizacaoId: 'org-1',
  sistemaId: 's-1',
  perfil: 'PASSIVO',
  notaMinima: 70,
  frequencia: 'DIARIA',
  horario: '03:30',
  permitirCriacaoDeDados: false,
  ...o,
});

const codigoDe = (fn: () => void): unknown => {
  try {
    fn();
  } catch (erro) {
    return (erro as { codigo?: unknown }).codigo;
  }
  return undefined;
};

describe('AgendamentoDeAvaliacao', () => {
  it('cria ativo, emite evento e reconstitui', () => {
    const ag = AgendamentoDeAvaliacao.criar(base(), AGORA);
    expect(ag.ativo).toBe(true);
    expect(ag.puxarEventos().map((e) => e.tipo)).toEqual(['AgendamentoCriado']);
    expect(AgendamentoDeAvaliacao.reconstituir(ag.paraDados()).paraDados()).toEqual(ag.paraDados());
  });

  it('valida horário e nota', () => {
    expect(codigoDe(() => AgendamentoDeAvaliacao.criar(base({ horario: '25:00' }), AGORA))).toBe('HORARIO_INVALIDO');
    expect(codigoDe(() => AgendamentoDeAvaliacao.criar(base({ notaMinima: 101 }), AGORA))).toBe('NOTA_INVALIDA');
  });

  it('SEMANAL exige dia da semana e MENSAL exige dia do mês', () => {
    expect(codigoDe(() => AgendamentoDeAvaliacao.criar(base({ frequencia: 'SEMANAL' }), AGORA))).toBe(
      'DIA_DA_SEMANA_INVALIDO',
    );
    expect(
      codigoDe(() => AgendamentoDeAvaliacao.criar(base({ frequencia: 'SEMANAL', diaDaSemana: 7 }), AGORA)),
    ).toBe('DIA_DA_SEMANA_INVALIDO');
    expect(codigoDe(() => AgendamentoDeAvaliacao.criar(base({ frequencia: 'MENSAL', diaDoMes: 29 }), AGORA))).toBe(
      'DIA_DO_MES_INVALIDO',
    );
    const ok = AgendamentoDeAvaliacao.criar(base({ frequencia: 'MENSAL', diaDoMes: 15, diaDaSemana: 2 }), AGORA);
    expect(ok.diaDoMes).toBe(15);
    expect(ok.diaDaSemana).toBeNull();
  });

  it('perfil ativo exige autorização', () => {
    expect(codigoDe(() => AgendamentoDeAvaliacao.criar(base({ perfil: 'PADRAO' }), AGORA))).toBe(
      'AUTORIZACAO_OBRIGATORIA',
    );
    const ag = AgendamentoDeAvaliacao.criar(
      base({ perfil: 'PADRAO', autorizacao: { responsavel: 'Ana', referencia: 'CHG-1' } }),
      AGORA,
    );
    expect(ag.autorizacao).toEqual({ responsavel: 'Ana', referencia: 'CHG-1' });
  });

  it('pausa e retoma', () => {
    const ag = AgendamentoDeAvaliacao.criar(base(), AGORA);
    ag.puxarEventos();
    ag.pausar(AGORA);
    expect(ag.ativo).toBe(false);
    ag.retomar(AGORA);
    expect(ag.ativo).toBe(true);
    expect(ag.puxarEventos().map((e) => e.tipo)).toEqual(['AgendamentoPausado', 'AgendamentoRetomado']);
  });
});
