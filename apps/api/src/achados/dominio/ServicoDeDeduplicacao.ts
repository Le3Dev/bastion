import { ImpressaoDigital, type Identificador } from '@bastion/dominio-compartilhado';
import type { Achado } from './Achado';
import type { DadosDaConstatacao } from './DadosDaConstatacao';

export interface ReincidenciaDeAchado {
  readonly achado: Achado;
  readonly constatacao: DadosDaConstatacao;
}

export interface ResultadoDaClassificacao {
  readonly novas: DadosDaConstatacao[];
  readonly reincidentes: ReincidenciaDeAchado[];
}

/** Serviço de domínio sem estado: separa constatações novas das que já têm achado. */
export const ServicoDeDeduplicacao = {
  classificar(
    constatacoes: readonly DadosDaConstatacao[],
    achadosExistentesPorImpressao: ReadonlyMap<string, Achado>,
    sistemaId: Identificador,
  ): ResultadoDaClassificacao {
    const novas: DadosDaConstatacao[] = [];
    const reincidentes: ReincidenciaDeAchado[] = [];
    const vistas = new Set<string>();

    for (const constatacao of constatacoes) {
      const impressao = ImpressaoDigital.de(sistemaId, constatacao.tipo, constatacao.local).valor;
      if (vistas.has(impressao)) continue;
      vistas.add(impressao);

      const existente = achadosExistentesPorImpressao.get(impressao);
      if (existente === undefined) novas.push(constatacao);
      else reincidentes.push({ achado: existente, constatacao });
    }
    return { novas, reincidentes };
  },
} as const;
