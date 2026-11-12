import type { EventoDeDominio, Papel } from '@bastion/dominio-compartilhado';

export type OrganizacaoFundada = EventoDeDominio<
  'OrganizacaoFundada',
  { organizacaoId: string; nome: string; donoEmail: string }
>;

export type MembroConvidado = EventoDeDominio<
  'MembroConvidado',
  { membroId: string; email: string; papel: Papel }
>;

export type ConviteAceito = EventoDeDominio<
  'ConviteAceito',
  { membroId: string; usuarioId: string }
>;

export type PapelAlterado = EventoDeDominio<
  'PapelAlterado',
  { membroId: string; papelAnterior: Papel; papelNovo: Papel }
>;

export type MembroRemovido = EventoDeDominio<'MembroRemovido', { membroId: string; email: string }>;

export type EventoDeOrganizacao =
  | OrganizacaoFundada
  | MembroConvidado
  | ConviteAceito
  | PapelAlterado
  | MembroRemovido;

export type ChaveDeApiCriada = EventoDeDominio<
  'ChaveDeApiCriada',
  { chaveId: string; nome: string; papel: Papel }
>;

export type ChaveDeApiRevogada = EventoDeDominio<'ChaveDeApiRevogada', { chaveId: string }>;

export type EventoDeChaveDeApi = ChaveDeApiCriada | ChaveDeApiRevogada;

export type WebhookCadastrado = EventoDeDominio<
  'WebhookCadastrado',
  { webhookId: string; url: string; eventos: string[] }
>;

export type WebhookAlterado = EventoDeDominio<
  'WebhookAlterado',
  { webhookId: string; ativo: boolean }
>;

export type EventoDeWebhook = WebhookCadastrado | WebhookAlterado;
