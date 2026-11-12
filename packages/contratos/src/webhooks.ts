import { z } from 'zod';
import { DataIso } from './comum';

export const CABECALHO_ASSINATURA = 'X-Bastion-Assinatura';
export const CABECALHO_EVENTO_ID = 'X-Bastion-Evento-Id';
export const CABECALHO_EVENTO_TIPO = 'X-Bastion-Evento-Tipo';

export const CorpoDoWebhook = z.object({
  id: z.uuid(),
  tipo: z.string(),
  ocorridoEm: DataIso,
  organizacaoId: z.uuid(),
  dados: z.record(z.string(), z.unknown()),
});
export type CorpoDoWebhook = z.infer<typeof CorpoDoWebhook>;
