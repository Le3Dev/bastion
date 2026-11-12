import type { EventoDeDominio } from '@bastion/dominio-compartilhado';

export type AgendamentoCriado = EventoDeDominio<
  'AgendamentoCriado',
  { agendamentoId: string; sistemaId: string; frequencia: string }
>;

export type AgendamentoPausado = EventoDeDominio<'AgendamentoPausado', { agendamentoId: string }>;

export type AgendamentoRetomado = EventoDeDominio<'AgendamentoRetomado', { agendamentoId: string }>;

export type EventoDeAgendamento = AgendamentoCriado | AgendamentoPausado | AgendamentoRetomado;
