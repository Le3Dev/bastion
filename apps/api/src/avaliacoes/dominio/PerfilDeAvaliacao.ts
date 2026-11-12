export type PerfilDeAvaliacao = 'PASSIVO' | 'PADRAO' | 'COMPLETO';

export const PERFIS_DE_AVALIACAO: readonly PerfilDeAvaliacao[] = ['PASSIVO', 'PADRAO', 'COMPLETO'];

const MINUTO_EM_MS = 60_000;

export const perfilDisponivelNoMvp = (perfil: PerfilDeAvaliacao): boolean => perfil === 'PASSIVO';

export const tempoMaximoDeExecucaoMs = (perfil: PerfilDeAvaliacao): number => {
  switch (perfil) {
    case 'PASSIVO':
      return 10 * MINUTO_EM_MS;
    case 'PADRAO':
      return 60 * MINUTO_EM_MS;
    case 'COMPLETO':
      return 240 * MINUTO_EM_MS;
  }
};

const ETAPAS_DO_PERFIL_PASSIVO: readonly string[] = [
  'Conferir propriedade e escopo',
  'Cabeçalhos de segurança',
  'TLS e certificado',
  'Flags de cookies',
  'Exposição de versão',
  'Análise e deduplicação',
];

/** Nomes das etapas, na ordem de execução. Perfis ainda indisponíveis no MVP não têm etapas. */
export const etapasDoPerfil = (perfil: PerfilDeAvaliacao): readonly string[] =>
  perfil === 'PASSIVO' ? ETAPAS_DO_PERFIL_PASSIVO : [];
