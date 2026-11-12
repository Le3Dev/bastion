import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ServicoDeAuditoria } from './auditoria/aplicacao/ServicoDeAuditoria';
import { rotasDeAuditoria } from './auditoria/infraestrutura/rotas';
import type { Dependencias } from './compartilhado/dependencias';
import { rotasDeSaude } from './compartilhado/rotas-de-saude';
import { ServicoDeChavesDeApi } from './contas/aplicacao/ServicoDeChavesDeApi';
import { ServicoDeContas } from './contas/aplicacao/ServicoDeContas';
import { ServicoDeMembros } from './contas/aplicacao/ServicoDeMembros';
import { ServicoDePlano } from './contas/aplicacao/ServicoDePlano';
import { ServicoDeWebhooks } from './contas/aplicacao/ServicoDeWebhooks';
import { rotasDeContas } from './contas/infraestrutura/rotas-de-contas';
import { rotasDeSessao } from './contas/infraestrutura/rotas-de-sessao';
import { ServicoDeSistemas } from './sistemas/aplicacao/ServicoDeSistemas';
import { rotasDeSistemas } from './sistemas/infraestrutura/rotas';

/** Serviços de aplicação, criados uma vez por aplicação. A leva 3 acrescenta os dela aqui. */
export interface Servicos {
  auditoria: ServicoDeAuditoria;
  contas: ServicoDeContas;
  membros: ServicoDeMembros;
  chaves: ServicoDeChavesDeApi;
  webhooks: ServicoDeWebhooks;
  plano: ServicoDePlano;
  sistemas: ServicoDeSistemas;
  // LEVA 3: avaliacoes, achados, relatorios e painel.
}

declare module 'fastify' {
  interface FastifyInstance {
    servicos: Servicos;
  }
}

export const criarServicos = ({ db, config, filas, relogio }: Dependencias): Servicos => {
  const auditoria = new ServicoDeAuditoria(relogio);
  return {
    auditoria,
    contas: new ServicoDeContas(db, config, relogio, auditoria),
    membros: new ServicoDeMembros(db, config, relogio, auditoria),
    chaves: new ServicoDeChavesDeApi(db, relogio, auditoria),
    webhooks: new ServicoDeWebhooks(db, filas, relogio, auditoria),
    plano: new ServicoDePlano(db, relogio),
    sistemas: new ServicoDeSistemas(db, filas, relogio, auditoria),
  };
};

/**
 * Único lugar onde as rotas de cada contexto são registradas.
 * LEVA 3: acrescentar aqui, no mesmo formato, os plugins de avaliações, achados, relatórios
 * e painel (e os respectivos serviços em `criarServicos`).
 */
export const registrarRotas = (
  app: FastifyInstance,
  dependencias: Dependencias,
  servicos: Servicos,
): void => {
  const raiz = app.withTypeProvider<ZodTypeProvider>();
  void raiz.register(rotasDeSaude(dependencias));
  void raiz.register(rotasDeSessao(dependencias.config, servicos.contas, servicos.membros));
  void raiz.register(rotasDeContas(servicos));
  void raiz.register(rotasDeSistemas(servicos.sistemas));
  void raiz.register(rotasDeAuditoria(dependencias, servicos.auditoria));
};
