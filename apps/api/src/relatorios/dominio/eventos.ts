import type { EventoDeDominio, Identificador } from '@bastion/dominio-compartilhado';

export type RelatorioGerado = EventoDeDominio<
  'RelatorioGerado',
  {
    readonly relatorioId: Identificador;
    readonly avaliacaoId: Identificador;
    readonly sistemaId: Identificador;
    readonly nota: number;
    readonly aprovado: boolean;
  }
>;

export type EventoDeRelatorio = RelatorioGerado;
