import type { FrequenciaDaAgenda } from '@bastion/contratos';

export interface RecorrenciaDoAgendamento {
  frequencia: FrequenciaDaAgenda;
  /** HH:MM, no fuso `FUSO_DOS_AGENDAMENTOS`. */
  horario: string;
  diaDaSemana: number | null;
  diaDoMes: number | null;
}

export const FUSO_DOS_AGENDAMENTOS = 'America/Sao_Paulo';

/** Converte a recorrência do agendamento em expressão cron de 5 campos (minuto hora dia mês semana). */
export const montarCron = (recorrencia: RecorrenciaDoAgendamento): string => {
  const partes = recorrencia.horario.split(':');
  const hora = Number(partes[0]);
  const minuto = Number(partes[1]);
  if (!Number.isInteger(hora) || !Number.isInteger(minuto) || hora < 0 || hora > 23 || minuto < 0 || minuto > 59) {
    throw new Error(`Horário inválido para o agendamento: ${recorrencia.horario}.`);
  }
  switch (recorrencia.frequencia) {
    case 'DIARIA':
      return `${minuto} ${hora} * * *`;
    case 'SEMANAL': {
      if (recorrencia.diaDaSemana === null) throw new Error('Dia da semana ausente no agendamento semanal.');
      return `${minuto} ${hora} * * ${recorrencia.diaDaSemana}`;
    }
    case 'MENSAL': {
      if (recorrencia.diaDoMes === null) throw new Error('Dia do mês ausente no agendamento mensal.');
      return `${minuto} ${hora} ${recorrencia.diaDoMes} * *`;
    }
  }
};
