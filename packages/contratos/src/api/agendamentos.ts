import { z } from 'zod';
import { DataIso, FREQUENCIAS_DA_AGENDA, PERFIS_DE_AVALIACAO } from '../comum';
import { AutorizacaoDeTeste } from './avaliacoes';

export const AgendamentoDto = z.object({
  id: z.uuid(),
  sistemaId: z.uuid(),
  sistemaNome: z.string(),
  perfil: z.enum(PERFIS_DE_AVALIACAO),
  notaMinima: z.number().int(),
  frequencia: z.enum(FREQUENCIAS_DA_AGENDA),
  horario: z.string(),
  diaDaSemana: z.number().int().nullable(),
  diaDoMes: z.number().int().nullable(),
  ativo: z.boolean(),
  autorizacao: z.object({ responsavel: z.string(), referencia: z.string() }).nullable(),
  proximaExecucaoEm: z.string().nullable(),
  criadoEm: DataIso,
});
export type AgendamentoDto = z.infer<typeof AgendamentoDto>;

export const CorpoDeNovoAgendamento = z
  .object({
    sistemaId: z.uuid(),
    perfil: z.enum(PERFIS_DE_AVALIACAO).default('PASSIVO'),
    notaMinima: z.number().int().min(0).max(100).default(70),
    frequencia: z.enum(FREQUENCIAS_DA_AGENDA),
    horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    diaDaSemana: z.number().int().min(0).max(6).optional(),
    diaDoMes: z.number().int().min(1).max(28).optional(),
    autorizacao: AutorizacaoDeTeste.optional(),
    permitirCriacaoDeDados: z.boolean().default(false),
  })
  .superRefine((corpo, ctx) => {
    if (corpo.frequencia === 'SEMANAL' && corpo.diaDaSemana === undefined) {
      ctx.addIssue({ code: 'custom', path: ['diaDaSemana'], message: 'Informe o dia da semana.' });
    }
    if (corpo.frequencia === 'MENSAL' && corpo.diaDoMes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['diaDoMes'], message: 'Informe o dia do mês (1 a 28).' });
    }
    if (corpo.perfil !== 'PASSIVO' && corpo.autorizacao === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['autorizacao'],
        message: 'Perfis ativos exigem a autorização por escrito.',
      });
    }
  });
export type CorpoDeNovoAgendamento = z.infer<typeof CorpoDeNovoAgendamento>;

export const CorpoDeAlteracaoDeAgendamento = z.object({ ativo: z.boolean() });
export type CorpoDeAlteracaoDeAgendamento = z.infer<typeof CorpoDeAlteracaoDeAgendamento>;
