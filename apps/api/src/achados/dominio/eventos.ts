import type { EventoDeDominio, Identificador, Severidade } from '@bastion/dominio-compartilhado';

export type AchadoCriado = EventoDeDominio<
  'AchadoCriado',
  {
    readonly achadoId: Identificador;
    readonly sistemaId: Identificador;
    readonly avaliacaoId: Identificador;
    readonly tipo: string;
    readonly titulo: string;
    readonly severidade: Severidade;
    readonly local: string;
  }
>;

export type AchadoReaberto = EventoDeDominio<
  'AchadoReaberto',
  { readonly achadoId: Identificador; readonly sistemaId: Identificador; readonly ator: string }
>;

export type AchadoCorrigido = EventoDeDominio<
  'AchadoCorrigido',
  { readonly achadoId: Identificador; readonly sistemaId: Identificador; readonly ator: string }
>;

export type EventoDeAchado = AchadoCriado | AchadoReaberto | AchadoCorrigido;
