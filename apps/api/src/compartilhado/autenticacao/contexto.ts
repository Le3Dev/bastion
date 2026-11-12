import type { Papel } from '@bastion/dominio-compartilhado';

export interface AtorDaRequisicao {
  tipo: 'USUARIO' | 'CHAVE_DE_API';
  id: string;
  nome: string;
}

/** Quem está chamando e em nome de qual organização. */
export interface ContextoDaRequisicao {
  organizacaoId: string;
  papel: Papel;
  ator: AtorDaRequisicao;
  /** Vínculo do usuário com a organização; `null` quando a chamada vem de uma chave de API. */
  membroId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    contexto: ContextoDaRequisicao | null;
  }
}

export const NOME_DO_COOKIE_DE_SESSAO = 'bastion_sessao';
