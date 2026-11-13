import { describe, expect, it } from 'vitest';
import { montarCron } from './cron-de-agendamento';

describe('montarCron', () => {
  it('monta a expressão diária', () => {
    expect(montarCron({ frequencia: 'DIARIA', horario: '03:30', diaDaSemana: null, diaDoMes: null })).toBe(
      '30 3 * * *',
    );
  });

  it('monta a expressão semanal', () => {
    expect(montarCron({ frequencia: 'SEMANAL', horario: '22:05', diaDaSemana: 1, diaDoMes: null })).toBe(
      '5 22 * * 1',
    );
  });

  it('monta a expressão mensal', () => {
    expect(montarCron({ frequencia: 'MENSAL', horario: '00:00', diaDaSemana: null, diaDoMes: 15 })).toBe(
      '0 0 15 * *',
    );
  });

  it('rejeita recorrência incompleta ou horário inválido', () => {
    expect(() => montarCron({ frequencia: 'SEMANAL', horario: '10:00', diaDaSemana: null, diaDoMes: null })).toThrow();
    expect(() => montarCron({ frequencia: 'DIARIA', horario: '25:00', diaDaSemana: null, diaDoMes: null })).toThrow();
  });
});
