import { z } from 'zod';
import { DataIso, ESTADOS_DO_MEMBRO, EVENTOS_DE_WEBHOOK, PAPEIS } from '../comum';

const Senha = z.string().min(12);

export const CorpoDeCadastroDeOrganizacao = z.object({
  nomeDaOrganizacao: z.string().min(1),
  nome: z.string().min(1),
  email: z.email(),
  senha: Senha,
});
export type CorpoDeCadastroDeOrganizacao = z.infer<typeof CorpoDeCadastroDeOrganizacao>;

export const CorpoDeEntrada = z.object({
  email: z.email(),
  senha: z.string().min(1),
});
export type CorpoDeEntrada = z.infer<typeof CorpoDeEntrada>;

export const RespostaDeSessao = z.object({
  usuario: z.object({ id: z.uuid(), nome: z.string(), email: z.email() }),
  organizacao: z.object({ id: z.uuid(), nome: z.string() }),
  papel: z.enum(PAPEIS),
});
export type RespostaDeSessao = z.infer<typeof RespostaDeSessao>;

export const MembroDto = z.object({
  id: z.uuid(),
  nome: z.string().nullable(),
  email: z.email(),
  papel: z.enum(PAPEIS),
  estado: z.enum(ESTADOS_DO_MEMBRO),
  desde: DataIso,
});
export type MembroDto = z.infer<typeof MembroDto>;

export const CorpoDeConvite = z.object({ email: z.email(), papel: z.enum(PAPEIS) });
export type CorpoDeConvite = z.infer<typeof CorpoDeConvite>;

export const RespostaDeConvite = z.object({ membro: MembroDto, tokenDoConvite: z.string() });
export type RespostaDeConvite = z.infer<typeof RespostaDeConvite>;

export const CorpoDeAceiteDeConvite = z.object({
  token: z.string().min(1),
  nome: z.string().min(1),
  senha: Senha,
});
export type CorpoDeAceiteDeConvite = z.infer<typeof CorpoDeAceiteDeConvite>;

export const CorpoDeAlteracaoDePapel = z.object({ papel: z.enum(PAPEIS) });
export type CorpoDeAlteracaoDePapel = z.infer<typeof CorpoDeAlteracaoDePapel>;

export const ChaveDeApiDto = z.object({
  id: z.uuid(),
  nome: z.string(),
  prefixo: z.string(),
  papel: z.enum(PAPEIS),
  criadaEm: DataIso,
  ultimoUsoEm: DataIso.nullable(),
  revogada: z.boolean(),
});
export type ChaveDeApiDto = z.infer<typeof ChaveDeApiDto>;

export const CorpoDeNovaChave = z.object({ nome: z.string().min(1), papel: z.enum(PAPEIS) });
export type CorpoDeNovaChave = z.infer<typeof CorpoDeNovaChave>;

export const RespostaDeNovaChave = z.object({ chave: ChaveDeApiDto, segredo: z.string() });
export type RespostaDeNovaChave = z.infer<typeof RespostaDeNovaChave>;

export const WebhookDto = z.object({
  id: z.uuid(),
  url: z.url(),
  eventos: z.array(z.enum(EVENTOS_DE_WEBHOOK)),
  ativo: z.boolean(),
  criadoEm: DataIso,
  ultimoEnvioEm: DataIso.nullable(),
});
export type WebhookDto = z.infer<typeof WebhookDto>;

export const CorpoDeNovoWebhook = z.object({
  url: z.url({ protocol: /^https$/ }),
  eventos: z.array(z.enum(EVENTOS_DE_WEBHOOK)).min(1),
});
export type CorpoDeNovoWebhook = z.infer<typeof CorpoDeNovoWebhook>;

export const RespostaDeNovoWebhook = z.object({
  webhook: WebhookDto,
  segredoDeAssinatura: z.string(),
});
export type RespostaDeNovoWebhook = z.infer<typeof RespostaDeNovoWebhook>;

export const CorpoDeAlteracaoDeWebhook = z.object({ ativo: z.boolean() });
export type CorpoDeAlteracaoDeWebhook = z.infer<typeof CorpoDeAlteracaoDeWebhook>;

export const PlanoDto = z.object({
  nome: z.string(),
  limites: z.object({
    sistemas: z.number().int(),
    avaliacoesPorMes: z.number().int(),
    membros: z.number().int(),
  }),
  uso: z.object({
    sistemas: z.number().int(),
    avaliacoesNoMes: z.number().int(),
    membros: z.number().int(),
  }),
});
export type PlanoDto = z.infer<typeof PlanoDto>;
