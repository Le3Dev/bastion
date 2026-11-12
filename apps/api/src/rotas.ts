import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ServicoDeAchados } from './achados/aplicacao/ServicoDeAchados';
import { rotasDeAchados } from './achados/infraestrutura/rotas';
import { ServicoDeAuditoria } from './auditoria/aplicacao/ServicoDeAuditoria';
import { rotasDeAuditoria } from './auditoria/infraestrutura/rotas';
import { ServicoDeAvaliacoes } from './avaliacoes/aplicacao/ServicoDeAvaliacoes';
import { rotasDeAvaliacoes } from './avaliacoes/infraestrutura/rotas';
import { criarCifragem } from './compartilhado/cifragem';
import type { Dependencias } from './compartilhado/dependencias';
import { rotasDeSaude } from './compartilhado/rotas-de-saude';
import { ServicoDeChavesDeApi } from './contas/aplicacao/ServicoDeChavesDeApi';
import { ServicoDeContas } from './contas/aplicacao/ServicoDeContas';
import { ServicoDeMembros } from './contas/aplicacao/ServicoDeMembros';
import { ServicoDePlano } from './contas/aplicacao/ServicoDePlano';
import { ServicoDeWebhooks } from './contas/aplicacao/ServicoDeWebhooks';
import { rotasDeContas } from './contas/infraestrutura/rotas-de-contas';
import { rotasDeSessao } from './contas/infraestrutura/rotas-de-sessao';
import { ServicoDePainel } from './painel/aplicacao/ServicoDePainel';
import { rotasDoPainel } from './painel/infraestrutura/rotas';
import { ServicoDeRelatorios } from './relatorios/aplicacao/ServicoDeRelatorios';
import { rotasDeRelatorios } from './relatorios/infraestrutura/rotas';
import { ServicoDeSistemas } from './sistemas/aplicacao/ServicoDeSistemas';
import { rotasDeSistemas } from './sistemas/infraestrutura/rotas';

/** Serviços de aplicação, criados uma vez por aplicação. */
export interface Servicos {
  auditoria: ServicoDeAuditoria;
  contas: ServicoDeContas;
  membros: ServicoDeMembros;
  chaves: ServicoDeChavesDeApi;
  webhooks: ServicoDeWebhooks;
  plano: ServicoDePlano;
  sistemas: ServicoDeSistemas;
  avaliacoes: ServicoDeAvaliacoes;
  achados: ServicoDeAchados;
  relatorios: ServicoDeRelatorios;
  painel: ServicoDePainel;
}

declare module 'fastify' {
  interface FastifyInstance {
    servicos: Servicos;
  }
}

export const criarServicos = ({
  db,
  config,
  filas,
  relogio,
  armazenamento,
  aoVivo,
}: Dependencias): Servicos => {
  const auditoria = new ServicoDeAuditoria(relogio);
  const cifragem = criarCifragem(config.chaveDeCifragem);
  const sistemas = new ServicoDeSistemas(db, filas, relogio, auditoria, cifragem);
  const achados = new ServicoDeAchados(db, filas, relogio, auditoria);
  const relatorios = new ServicoDeRelatorios(db, armazenamento, relogio, auditoria);
  const avaliacoes = new ServicoDeAvaliacoes(
    db,
    filas,
    relogio,
    auditoria,
    sistemas,
    achados,
    relatorios,
    aoVivo,
    cifragem,
  );
  return {
    auditoria,
    contas: new ServicoDeContas(db, config, relogio, auditoria),
    membros: new ServicoDeMembros(db, config, relogio, auditoria),
    chaves: new ServicoDeChavesDeApi(db, relogio, auditoria),
    webhooks: new ServicoDeWebhooks(db, filas, relogio, auditoria),
    plano: new ServicoDePlano(db, relogio),
    sistemas,
    avaliacoes,
    achados,
    relatorios,
    painel: new ServicoDePainel(db, sistemas, avaliacoes, achados),
  };
};

/** Único lugar onde as rotas de cada contexto são registradas. */
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
  void raiz.register(rotasDeAvaliacoes(servicos.avaliacoes, dependencias.aoVivo));
  void raiz.register(rotasDeAchados(servicos));
  void raiz.register(rotasDeRelatorios(servicos));
  void raiz.register(rotasDoPainel(servicos.painel));
};
