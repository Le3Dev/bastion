import type { EventoDeDominio, Identificador } from '@bastion/dominio-compartilhado';
import type { PerfilDeAvaliacao } from './PerfilDeAvaliacao';

export type OrigemDaAvaliacao = 'WEB' | 'API' | 'CI';

export type AvaliacaoSolicitada = EventoDeDominio<
  'AvaliacaoSolicitada',
  {
    readonly avaliacaoId: Identificador;
    readonly sistemaId: Identificador;
    readonly perfil: PerfilDeAvaliacao;
    readonly origem: OrigemDaAvaliacao;
    readonly solicitadaPor: string;
    readonly sistemaVerificado: boolean;
  }
>;

export type AvaliacaoConcluida = EventoDeDominio<
  'AvaliacaoConcluida',
  {
    readonly avaliacaoId: Identificador;
    readonly sistemaId: Identificador;
    readonly nota: number;
    readonly aprovada: boolean;
  }
>;

export type AvaliacaoFalhou = EventoDeDominio<
  'AvaliacaoFalhou',
  { readonly avaliacaoId: Identificador; readonly sistemaId: Identificador; readonly motivo: string }
>;

export type AvaliacaoCancelada = EventoDeDominio<
  'AvaliacaoCancelada',
  { readonly avaliacaoId: Identificador; readonly sistemaId: Identificador; readonly por: string }
>;

export type EventoDeAvaliacao =
  | AvaliacaoSolicitada
  | AvaliacaoConcluida
  | AvaliacaoFalhou
  | AvaliacaoCancelada;
