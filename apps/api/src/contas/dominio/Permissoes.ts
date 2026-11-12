import { ErroDeDominio, type Papel } from '@bastion/dominio-compartilhado';

export const PERMISSOES = [
  'GERENCIAR_MEMBROS',
  'GERENCIAR_CHAVES_DE_API',
  'GERENCIAR_WEBHOOKS',
  'CADASTRAR_SISTEMA',
  'VERIFICAR_SISTEMA',
  'SOLICITAR_AVALIACAO',
  'PARAR_AVALIACAO',
  'TRIAR_ACHADO',
  'CORRIGIR_ACHADO',
  'ACEITAR_RISCO',
  'VER_AUDITORIA',
  'LER',
] as const;

export type Permissao = (typeof PERMISSOES)[number];

const PERMISSOES_DO_ANALISTA: readonly Permissao[] = [
  'CADASTRAR_SISTEMA',
  'VERIFICAR_SISTEMA',
  'SOLICITAR_AVALIACAO',
  'PARAR_AVALIACAO',
  'TRIAR_ACHADO',
  'CORRIGIR_ACHADO',
  'ACEITAR_RISCO',
  'LER',
];

const MATRIZ: Record<Papel, readonly Permissao[]> = {
  DONO: PERMISSOES,
  ADMIN: PERMISSOES,
  ANALISTA: PERMISSOES_DO_ANALISTA,
  DESENVOLVEDOR: ['SOLICITAR_AVALIACAO', 'CORRIGIR_ACHADO', 'LER'],
  LEITOR: ['LER'],
};

export const papelPode = (papel: Papel, permissao: Permissao): boolean =>
  MATRIZ[papel].includes(permissao);

export const exigirPermissao = (papel: Papel, permissao: Permissao): void => {
  if (!papelPode(papel, permissao)) {
    throw new ErroDeDominio(`Seu papel (${papel}) não permite esta ação.`, 'PERMISSAO_NEGADA');
  }
};
