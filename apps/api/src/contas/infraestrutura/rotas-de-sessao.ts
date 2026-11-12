import {
  CorpoDeAceiteDeConvite,
  CorpoDeCadastroDeOrganizacao,
  CorpoDeEntrada,
  RespostaDeSessao,
} from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  contextoDe,
  definirCookieDeSessao,
  exigirAutenticacao,
  limparCookieDeSessao,
} from '../../compartilhado/autenticacao/autenticacao';
import { NOME_DO_COOKIE_DE_SESSAO } from '../../compartilhado/autenticacao/contexto';
import type { Config } from '../../compartilhado/config';
import type { ServicoDeContas } from '../aplicacao/ServicoDeContas';
import type { ServicoDeMembros } from '../aplicacao/ServicoDeMembros';

export const rotasDeSessao =
  (config: Config, contas: ServicoDeContas, membros: ServicoDeMembros): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/v1/organizacoes',
      { schema: { body: CorpoDeCadastroDeOrganizacao, response: { 201: RespostaDeSessao } } },
      async (request, reply) => {
        const { resposta, tokenDaSessao } = await contas.cadastrarOrganizacao(request.body);
        definirCookieDeSessao(reply, tokenDaSessao, config);
        return reply.code(201).send(resposta);
      },
    );

    app.post(
      '/v1/sessao',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: { body: CorpoDeEntrada, response: { 200: RespostaDeSessao } },
      },
      async (request, reply) => {
        const { resposta, tokenDaSessao } = await contas.entrar(request.body);
        definirCookieDeSessao(reply, tokenDaSessao, config);
        return reply.code(200).send(resposta);
      },
    );

    app.get(
      '/v1/sessao',
      { preHandler: exigirAutenticacao, schema: { response: { 200: RespostaDeSessao } } },
      async (request) => contas.sessaoAtual(contextoDe(request)),
    );

    app.delete('/v1/sessao', { preHandler: exigirAutenticacao }, async (request, reply) => {
      await contas.sair(contextoDe(request), request.cookies[NOME_DO_COOKIE_DE_SESSAO]);
      limparCookieDeSessao(reply, config);
      return reply.code(204).send();
    });

    app.post(
      '/v1/convites/aceitar',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: { body: CorpoDeAceiteDeConvite, response: { 200: RespostaDeSessao } },
      },
      async (request, reply) => {
        const { resposta, tokenDaSessao } = await membros.aceitarConvite(request.body);
        definirCookieDeSessao(reply, tokenDaSessao, config);
        return reply.code(200).send(resposta);
      },
    );
  };
