import { z } from 'zod';
import { ConsultaPaginada, DataIso, ESTADOS_DO_ACHADO, SEVERIDADES, TIPOS_DE_CONSTATACAO } from '../comum';

export const AchadoResumoDto = z.object({
  id: z.uuid(),
  sistemaId: z.uuid(),
  sistemaNome: z.string(),
  titulo: z.string(),
  tipo: z.enum(TIPOS_DE_CONSTATACAO),
  severidade: z.enum(SEVERIDADES),
  estado: z.enum(ESTADOS_DO_ACHADO),
  local: z.string(),
  ocorrencias: z.number().int(),
  ultimaVezEm: DataIso,
});
export type AchadoResumoDto = z.infer<typeof AchadoResumoDto>;

export const AchadoDto = AchadoResumoDto.extend({
  impressaoDigital: z.string(),
  descricao: z.string(),
  evidencia: z.object({
    requisicao: z.string(),
    resposta: z.string(),
    observacao: z.string(),
  }),
  correcaoSugerida: z.string(),
  conformidade: z.object({ owasp: z.array(z.string()), lgpd: z.array(z.string()) }),
  primeiraVezEm: DataIso,
  avaliacaoIds: z.array(z.uuid()),
  riscoAceito: z
    .object({
      justificativa: z.string(),
      responsavel: z.string(),
      validoAte: DataIso,
    })
    .nullable(),
  historico: z.array(
    z.object({
      em: DataIso,
      de: z.enum(ESTADOS_DO_ACHADO).nullable(),
      para: z.enum(ESTADOS_DO_ACHADO),
      ator: z.string(),
      comentario: z.string().nullable(),
    }),
  ),
  transicoesPossiveis: z.array(z.enum(ESTADOS_DO_ACHADO)),
});
export type AchadoDto = z.infer<typeof AchadoDto>;

export const ConsultaDeAchados = ConsultaPaginada.extend({
  /** Lista de severidades separadas por vírgula. */
  severidade: z.string().optional(),
  estado: z.enum(ESTADOS_DO_ACHADO).optional(),
  sistemaId: z.uuid().optional(),
  busca: z.string().optional(),
  incluirFechados: z.stringbool().optional(),
});
export type ConsultaDeAchados = z.infer<typeof ConsultaDeAchados>;

export const CorpoDeMudancaDeEstado = z
  .object({
    estado: z.enum(ESTADOS_DO_ACHADO),
    comentario: z.string().optional(),
    riscoAceito: z
      .object({
        justificativa: z.string().min(20),
        responsavel: z.string().min(1),
        validoAte: DataIso,
      })
      .optional(),
  })
  .superRefine((corpo, ctx) => {
    if (corpo.estado === 'RISCO_ACEITO' && corpo.riscoAceito === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['riscoAceito'],
        message: 'Informe justificativa, responsável e validade para aceitar o risco.',
      });
    }
  });
export type CorpoDeMudancaDeEstado = z.infer<typeof CorpoDeMudancaDeEstado>;

export const RespostaDeMudancaDeEstado = z.object({ estado: z.enum(ESTADOS_DO_ACHADO) });
export type RespostaDeMudancaDeEstado = z.infer<typeof RespostaDeMudancaDeEstado>;

export const RespostaDeRevalidacao = z.object({ avaliacaoId: z.uuid() });
export type RespostaDeRevalidacao = z.infer<typeof RespostaDeRevalidacao>;
