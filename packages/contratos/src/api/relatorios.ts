import { z } from 'zod';
import { DataIso, PERFIS_DE_AVALIACAO, SEVERIDADES } from '../comum';
import { AchadoResumoDto } from './achados';

export const RelatorioResumoDto = z.object({
  id: z.uuid(),
  avaliacaoId: z.uuid(),
  sistemaNome: z.string(),
  geradoEm: DataIso,
  nota: z.number(),
});
export type RelatorioResumoDto = z.infer<typeof RelatorioResumoDto>;

const ContagemDeCodigo = z.object({ codigo: z.string(), quantidade: z.number().int() });

export const RelatorioDto = z.object({
  id: z.uuid(),
  avaliacaoId: z.uuid(),
  sistemaId: z.uuid(),
  sistemaNome: z.string(),
  perfil: z.enum(PERFIS_DE_AVALIACAO),
  geradoEm: DataIso,
  nota: z.number(),
  notaMinima: z.number().int(),
  aprovado: z.boolean(),
  resumo: z.string(),
  escopo: z.object({
    urlDeHomologacao: z.string(),
    dominioDeProducao: z.string(),
    requisicoesPermitidas: z.number().int(),
    requisicoesBloqueadas: z.number().int(),
  }),
  contagemPorSeveridade: z.record(z.enum(SEVERIDADES), z.number().int()),
  conformidade: z.object({
    owasp: z.array(ContagemDeCodigo),
    lgpd: z.array(ContagemDeCodigo),
  }),
  achados: z.array(AchadoResumoDto),
});
export type RelatorioDto = z.infer<typeof RelatorioDto>;

export const ConsultaDeRelatorio = z.object({
  formato: z.enum(['json', 'html', 'pdf']).optional(),
});
export type ConsultaDeRelatorio = z.infer<typeof ConsultaDeRelatorio>;
