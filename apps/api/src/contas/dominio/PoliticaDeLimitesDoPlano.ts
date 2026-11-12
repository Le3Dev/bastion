import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export const LIMITES_DO_PLANO = { sistemas: 10, avaliacoesPorMes: 100, membros: 10 } as const;

const limiteAtingido = (descricao: string): ErroDeDominio =>
  new ErroDeDominio(`Limite do plano atingido: até ${descricao}.`, 'LIMITE_DO_PLANO');

/** Serviço de domínio sem estado: regras de limites do plano. */
export const PoliticaDeLimitesDoPlano = {
  exigirPodeCadastrarSistema(sistemasAtivos: number): void {
    if (sistemasAtivos >= LIMITES_DO_PLANO.sistemas) {
      throw limiteAtingido(`${LIMITES_DO_PLANO.sistemas} sistemas ativos`);
    }
  },

  exigirPodeSolicitarAvaliacao(avaliacoesNoMes: number): void {
    if (!PoliticaDeLimitesDoPlano.cabeAvaliacao(avaliacoesNoMes)) {
      throw limiteAtingido(`${LIMITES_DO_PLANO.avaliacoesPorMes} avaliações por mês`);
    }
  },

  exigirPodeConvidarMembro(membros: number): void {
    if (membros >= LIMITES_DO_PLANO.membros) {
      throw limiteAtingido(`${LIMITES_DO_PLANO.membros} membros`);
    }
  },

  cabeAvaliacao(avaliacoesNoMes: number): boolean {
    return avaliacoesNoMes < LIMITES_DO_PLANO.avaliacoesPorMes;
  },
};
