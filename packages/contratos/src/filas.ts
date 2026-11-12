import { z } from 'zod';
import {
  Constatacao,
  DECISOES_DO_GUARDIAO,
  ESTADOS_DA_ETAPA,
  EscopoDaTarefa,
  METODOS_DE_VERIFICACAO,
  PERFIS_DE_AVALIACAO,
} from './comum';

export const FILAS = {
  avaliacoes: 'avaliacoes',
  verificacoes: 'verificacoes',
  webhooks: 'webhooks',
  resultados: 'resultados',
} as const;
export type NomeDaFila = (typeof FILAS)[keyof typeof FILAS];

export const chaveDeCancelamento = (avaliacaoId: string): string =>
  `bastion:cancelamento:${avaliacaoId}`;

export const TarefaExecutarAvaliacao = z.object({
  avaliacaoId: z.uuid(),
  organizacaoId: z.uuid(),
  sistemaId: z.uuid(),
  perfil: z.enum(PERFIS_DE_AVALIACAO),
  urlDeHomologacao: z.string(),
  escopo: EscopoDaTarefa,
});
export type TarefaExecutarAvaliacao = z.infer<typeof TarefaExecutarAvaliacao>;

export const TarefaVerificarPropriedade = z.object({
  sistemaId: z.uuid(),
  organizacaoId: z.uuid(),
  metodo: z.enum(METODOS_DE_VERIFICACAO),
  token: z.string(),
  urlDeHomologacao: z.string(),
});
export type TarefaVerificarPropriedade = z.infer<typeof TarefaVerificarPropriedade>;

export const ResultadoDaVerificacao = z.object({
  verificado: z.boolean(),
  mensagem: z.string(),
});
export type ResultadoDaVerificacao = z.infer<typeof ResultadoDaVerificacao>;

export const TarefaEntregarWebhook = z.object({
  entregaId: z.uuid(),
  organizacaoId: z.uuid(),
  url: z.string(),
  corpo: z.string(),
  assinatura: z.string(),
  eventoId: z.uuid(),
  tipoDoEvento: z.string(),
});
export type TarefaEntregarWebhook = z.infer<typeof TarefaEntregarWebhook>;

const base = {
  idDoEvento: z.uuid(),
  organizacaoId: z.uuid(),
  em: z.iso.datetime({ offset: true }),
};
const baseDeAvaliacao = { ...base, avaliacaoId: z.uuid() };

export const EventoDeResultado = z.discriminatedUnion('tipo', [
  z.object({ ...baseDeAvaliacao, tipo: z.literal('preparacao-iniciada') }),
  z.object({ ...baseDeAvaliacao, tipo: z.literal('execucao-iniciada') }),
  z.object({ ...baseDeAvaliacao, tipo: z.literal('analise-iniciada') }),
  z.object({
    ...baseDeAvaliacao,
    tipo: z.literal('etapa-atualizada'),
    nome: z.string(),
    estado: z.enum(ESTADOS_DA_ETAPA),
    progresso: z.number().min(0).max(100),
  }),
  z.object({
    ...baseDeAvaliacao,
    tipo: z.literal('requisicao-do-guardiao'),
    metodo: z.string(),
    url: z.string(),
    decisao: z.enum(DECISOES_DO_GUARDIAO),
    motivo: z.string(),
    status: z.number().int().nullable(),
  }),
  z.object({ ...baseDeAvaliacao, tipo: z.literal('constatacao'), constatacao: Constatacao }),
  z.object({ ...baseDeAvaliacao, tipo: z.literal('avaliacao-finalizada') }),
  z.object({ ...baseDeAvaliacao, tipo: z.literal('avaliacao-falhou'), motivo: z.string() }),
  z.object({
    ...base,
    tipo: z.literal('entrega-concluida'),
    entregaId: z.uuid(),
    sucesso: z.boolean(),
    status: z.number().int().nullable(),
    mensagem: z.string().nullable(),
  }),
]);
export type EventoDeResultado = z.infer<typeof EventoDeResultado>;
