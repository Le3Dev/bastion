export type PerfilDeAvaliacao = 'PASSIVO' | 'PADRAO' | 'COMPLETO' | 'IA';

export const PERFIS_DE_AVALIACAO: readonly PerfilDeAvaliacao[] = ['PASSIVO', 'PADRAO', 'COMPLETO', 'IA'];

const MINUTO_EM_MS = 60_000;

/** Todos os perfis conhecidos estão disponíveis (nome mantido por compatibilidade). */
export const perfilDisponivelNoMvp = (perfil: PerfilDeAvaliacao): boolean =>
  PERFIS_DE_AVALIACAO.includes(perfil);

/** Perfis ativos enviam requisições além da leitura passiva e exigem autorização por escrito. */
export const perfilEhAtivo = (perfil: PerfilDeAvaliacao): boolean => perfil !== 'PASSIVO';

export const tempoMaximoDeExecucaoMs = (perfil: PerfilDeAvaliacao): number => {
  switch (perfil) {
    case 'PASSIVO':
      return 10 * MINUTO_EM_MS;
    case 'PADRAO':
      return 30 * MINUTO_EM_MS;
    case 'COMPLETO':
      return 60 * MINUTO_EM_MS;
    case 'IA':
      return 20 * MINUTO_EM_MS;
  }
};

export const metodosDoPerfil = (perfil: PerfilDeAvaliacao): string[] => {
  switch (perfil) {
    case 'PASSIVO':
      return ['GET', 'HEAD'];
    case 'PADRAO':
      return ['GET', 'HEAD', 'OPTIONS'];
    case 'COMPLETO':
      return ['GET', 'HEAD', 'OPTIONS', 'POST'];
    case 'IA':
      return ['GET', 'HEAD', 'POST'];
  }
};

export const tetoDeRequisicoes = (perfil: PerfilDeAvaliacao): number => {
  switch (perfil) {
    case 'PASSIVO':
      return 100;
    case 'PADRAO':
      return 500;
    case 'COMPLETO':
      return 2000;
    case 'IA':
      return 100;
  }
};

/** Prefixos de caminho que nunca são tocados por padrão. */
export const caminhosExcluidosPadrao = (): string[] => [
  '/logout',
  '/sair',
  '/sign-out',
  '/delete',
  '/excluir',
  '/remover',
  '/pagamento',
  '/payment',
  '/checkout',
  '/admin/delete',
];

const ETAPAS_DO_PERFIL_PASSIVO: readonly string[] = [
  'Conferir propriedade e escopo',
  'Cabeçalhos de segurança',
  'TLS e certificado',
  'Flags de cookies',
  'Exposição de versão',
  'Análise e deduplicação',
];

const ETAPAS_DO_PERFIL_PADRAO: readonly string[] = [
  'Conferir propriedade e escopo',
  'Cabeçalhos de segurança',
  'TLS e certificado',
  'Flags de cookies',
  'Exposição de versão',
  'Mapeamento de páginas',
  'Arquivos e configurações expostos',
  'CORS e métodos HTTP',
  'Entrada refletida e redirecionamentos',
  'Análise e deduplicação',
];

const ETAPAS_DO_PERFIL_COMPLETO: readonly string[] = [
  ...ETAPAS_DO_PERFIL_PADRAO.slice(0, -1),
  'Autenticação de teste',
  'Controle de acesso',
  'Injeção (SQL, template, caminho)',
  'Análise e deduplicação',
];

const ETAPAS_DO_PERFIL_IA: readonly string[] = [
  'Conferir propriedade e escopo',
  'Conector de IA',
  'Integridade do prompt',
  'Vazamento de informação',
  'Segurança da saída',
  'Análise e deduplicação',
];

/** Nomes das etapas, na ordem de execução (o worker emite com os mesmos nomes). */
export const etapasDoPerfil = (perfil: PerfilDeAvaliacao): readonly string[] => {
  switch (perfil) {
    case 'PASSIVO':
      return ETAPAS_DO_PERFIL_PASSIVO;
    case 'PADRAO':
      return ETAPAS_DO_PERFIL_PADRAO;
    case 'COMPLETO':
      return ETAPAS_DO_PERFIL_COMPLETO;
    case 'IA':
      return ETAPAS_DO_PERFIL_IA;
  }
};
