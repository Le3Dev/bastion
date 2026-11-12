import { z } from 'zod';
import { SEVERIDADES } from '../comum';
import { AchadoResumoDto } from './achados';
import { AvaliacaoDto } from './avaliacoes';

export const PainelDto = z.object({
  notaMedia: z.number().nullable(),
  achadosEmAbertoPorSeveridade: z.record(z.enum(SEVERIDADES), z.number().int()),
  sistemas: z.object({ verificados: z.number().int(), pendentes: z.number().int() }),
  avaliacoesEmAndamento: z.number().int(),
  avaliacoesRecentes: z.array(AvaliacaoDto),
  achadosCriticosEAltos: z.array(AchadoResumoDto),
});
export type PainelDto = z.infer<typeof PainelDto>;
