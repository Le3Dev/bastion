import { z } from 'zod';
import { ConsultaPaginada, DataIso, TIPOS_DE_ATOR } from '../comum';

export const RegistroDeAuditoriaDto = z.object({
  id: z.string(),
  em: DataIso,
  ator: z.object({
    tipo: z.enum(TIPOS_DE_ATOR),
    id: z.string().nullable(),
    nome: z.string(),
  }),
  acao: z.string(),
  alvo: z.string(),
  detalhe: z.record(z.string(), z.unknown()).nullable(),
});
export type RegistroDeAuditoriaDto = z.infer<typeof RegistroDeAuditoriaDto>;

export const ConsultaDeAuditoria = ConsultaPaginada.extend({
  ator: z.string().optional(),
  acao: z.string().optional(),
  busca: z.string().optional(),
});
export type ConsultaDeAuditoria = z.infer<typeof ConsultaDeAuditoria>;
