import { z } from 'zod';
import {
  DataIso,
  ESTADOS_DA_VERIFICACAO,
  METODOS_DE_VERIFICACAO,
  TIPOS_DE_SISTEMA,
} from '../comum';

export const CorpoDeCadastroDeSistema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(TIPOS_DE_SISTEMA),
  urlDeHomologacao: z.url(),
  dominioDeProducao: z.string().min(1),
  metodoDeVerificacao: z.enum(METODOS_DE_VERIFICACAO),
});
export type CorpoDeCadastroDeSistema = z.infer<typeof CorpoDeCadastroDeSistema>;

export const InstrucoesDeVerificacaoDto = z.object({
  metodo: z.enum(METODOS_DE_VERIFICACAO),
  token: z.string(),
  registroDns: z.object({ nome: z.string(), valor: z.string() }),
  arquivo: z.object({ url: z.string(), conteudo: z.string() }),
  cabecalho: z.object({ nome: z.string(), valor: z.string() }),
});
export type InstrucoesDeVerificacaoDto = z.infer<typeof InstrucoesDeVerificacaoDto>;

export const RespostaDeCadastroDeSistema = z.object({
  id: z.uuid(),
  estadoVerificacao: z.enum(ESTADOS_DA_VERIFICACAO),
  verificacao: InstrucoesDeVerificacaoDto,
});
export type RespostaDeCadastroDeSistema = z.infer<typeof RespostaDeCadastroDeSistema>;

export const SistemaDto = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(TIPOS_DE_SISTEMA),
  urlDeHomologacao: z.string(),
  dominioDeProducao: z.string(),
  verificacao: z.object({
    metodo: z.enum(METODOS_DE_VERIFICACAO).nullable(),
    estado: z.enum(ESTADOS_DA_VERIFICACAO).nullable(),
    verificadoEm: DataIso.nullable(),
    expiraEm: DataIso.nullable(),
    mensagem: z.string().nullable(),
  }),
  ultimaNota: z.number().nullable(),
  criadoEm: DataIso,
});
export type SistemaDto = z.infer<typeof SistemaDto>;

export const CorpoDeVerificacao = z.object({
  metodo: z.enum(METODOS_DE_VERIFICACAO).optional(),
});
export type CorpoDeVerificacao = z.infer<typeof CorpoDeVerificacao>;

export const RespostaDeVerificacao = z.object({
  verificado: z.boolean(),
  expiraEm: DataIso.nullable(),
  mensagem: z.string().nullable(),
});
export type RespostaDeVerificacao = z.infer<typeof RespostaDeVerificacao>;
