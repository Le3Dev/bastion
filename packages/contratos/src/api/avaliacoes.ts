import { z } from 'zod';
import {
  ConsultaPaginada,
  DECISOES_DO_GUARDIAO,
  DataIso,
  ESTADOS_DA_AVALIACAO,
  ESTADOS_DA_ETAPA,
  ORIGENS_DA_AVALIACAO,
  PERFIS_DE_AVALIACAO,
  SEVERIDADES,
} from '../comum';
import { AchadoResumoDto } from './achados';

export const CorpoDeSolicitacaoDeAvaliacao = z.object({
  sistemaId: z.uuid(),
  perfil: z.enum(PERFIS_DE_AVALIACAO).default('PASSIVO'),
  notaMinima: z.number().int().min(0).max(100).default(70),
});
export type CorpoDeSolicitacaoDeAvaliacao = z.infer<typeof CorpoDeSolicitacaoDeAvaliacao>;

export const RespostaDeSolicitacao = z.object({
  id: z.uuid(),
  estado: z.enum(ESTADOS_DA_AVALIACAO),
});
export type RespostaDeSolicitacao = z.infer<typeof RespostaDeSolicitacao>;

export const EtapaDto = z.object({
  ordem: z.number().int(),
  nome: z.string(),
  estado: z.enum(ESTADOS_DA_ETAPA),
  progresso: z.number().min(0).max(100),
});
export type EtapaDto = z.infer<typeof EtapaDto>;

export const AvaliacaoDto = z.object({
  id: z.uuid(),
  sistemaId: z.uuid(),
  sistemaNome: z.string(),
  perfil: z.enum(PERFIS_DE_AVALIACAO),
  origem: z.enum(ORIGENS_DA_AVALIACAO),
  estado: z.enum(ESTADOS_DA_AVALIACAO),
  progresso: z.number().min(0).max(100),
  nota: z.number().nullable(),
  notaMinima: z.number().int(),
  aprovada: z.boolean().nullable(),
  etapas: z.array(EtapaDto),
  solicitadaEm: DataIso,
  iniciadaEm: DataIso.nullable(),
  concluidaEm: DataIso.nullable(),
  motivoDaFalha: z.string().nullable(),
  relatorioId: z.uuid().nullable(),
  contagemDeAchados: z.record(z.enum(SEVERIDADES), z.number().int()),
});
export type AvaliacaoDto = z.infer<typeof AvaliacaoDto>;

export const ConsultaDeAvaliacoes = ConsultaPaginada.extend({
  sistemaId: z.uuid().optional(),
  estado: z.enum(ESTADOS_DA_AVALIACAO).optional(),
});
export type ConsultaDeAvaliacoes = z.infer<typeof ConsultaDeAvaliacoes>;

export const RequisicaoDoGuardiaoDto = z.object({
  id: z.string(),
  em: DataIso,
  metodo: z.string(),
  url: z.string(),
  decisao: z.enum(DECISOES_DO_GUARDIAO),
  motivo: z.string(),
  status: z.number().int().nullable(),
});
export type RequisicaoDoGuardiaoDto = z.infer<typeof RequisicaoDoGuardiaoDto>;

export const RespostaDeParada = z.object({ estado: z.literal('CANCELADA') });
export type RespostaDeParada = z.infer<typeof RespostaDeParada>;

export const EventoAoVivo = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('avaliacao'), dados: AvaliacaoDto }),
  z.object({ tipo: z.literal('requisicao'), dados: RequisicaoDoGuardiaoDto }),
  z.object({ tipo: z.literal('achado'), dados: AchadoResumoDto }),
]);
export type EventoAoVivo = z.infer<typeof EventoAoVivo>;
