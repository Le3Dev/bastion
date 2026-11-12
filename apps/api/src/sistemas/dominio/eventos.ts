import type { EventoDeDominio } from '@bastion/dominio-compartilhado';
import type { MetodoDeVerificacao } from './MetodoDeVerificacao';

export type SistemaCadastrado = EventoDeDominio<
  'SistemaCadastrado',
  { sistemaId: string; nome: string; hostDeHomologacao: string }
>;

export type SistemaVerificado = EventoDeDominio<
  'SistemaVerificado',
  { sistemaId: string; metodo: MetodoDeVerificacao }
>;

export type VerificacaoDeSistemaFalhou = EventoDeDominio<
  'VerificacaoDeSistemaFalhou',
  { sistemaId: string; metodo: MetodoDeVerificacao; mensagem: string }
>;

export type SistemaArquivado = EventoDeDominio<'SistemaArquivado', { sistemaId: string }>;

export type EventoDeSistema =
  | SistemaCadastrado
  | SistemaVerificado
  | VerificacaoDeSistemaFalhou
  | SistemaArquivado;
