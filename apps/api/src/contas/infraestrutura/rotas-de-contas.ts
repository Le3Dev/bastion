import {
  ChaveDeApiDto,
  CorpoDeAlteracaoDePapel,
  CorpoDeAlteracaoDeWebhook,
  CorpoDeConvite,
  CorpoDeNovaChave,
  CorpoDeNovoWebhook,
  MembroDto,
  ParametroId,
  PlanoDto,
  RespostaDeConvite,
  RespostaDeNovaChave,
  RespostaDeNovoWebhook,
  WebhookDto,
} from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { ServicoDeChavesDeApi } from '../aplicacao/ServicoDeChavesDeApi';
import type { ServicoDeMembros } from '../aplicacao/ServicoDeMembros';
import type { ServicoDePlano } from '../aplicacao/ServicoDePlano';
import type { ServicoDeWebhooks } from '../aplicacao/ServicoDeWebhooks';

export interface ServicosDeContasParaRotas {
  membros: ServicoDeMembros;
  chaves: ServicoDeChavesDeApi;
  webhooks: ServicoDeWebhooks;
  plano: ServicoDePlano;
}

export const rotasDeContas =
  ({ membros, chaves, webhooks, plano }: ServicosDeContasParaRotas): FastifyPluginAsyncZod =>
  async (app) => {
    // --- Membros ---
    app.get(
      '/v1/membros',
      {
        preHandler: exigirPermissao('LER'),
        schema: { response: { 200: z.object({ itens: z.array(MembroDto) }) } },
      },
      async (request) => ({ itens: await membros.listar(contextoDe(request)) }),
    );

    app.post(
      '/v1/membros',
      {
        preHandler: exigirPermissao('GERENCIAR_MEMBROS'),
        schema: { body: CorpoDeConvite, response: { 201: RespostaDeConvite } },
      },
      async (request, reply) =>
        reply.code(201).send(await membros.convidar(contextoDe(request), request.body)),
    );

    app.patch(
      '/v1/membros/:id',
      {
        preHandler: exigirPermissao('GERENCIAR_MEMBROS'),
        schema: { params: ParametroId, body: CorpoDeAlteracaoDePapel, response: { 200: MembroDto } },
      },
      async (request) =>
        membros.alterarPapel(contextoDe(request), request.params.id, request.body),
    );

    app.delete(
      '/v1/membros/:id',
      { preHandler: exigirPermissao('GERENCIAR_MEMBROS'), schema: { params: ParametroId } },
      async (request, reply) => {
        await membros.remover(contextoDe(request), request.params.id);
        return reply.code(204).send();
      },
    );

    // --- Chaves de API ---
    app.get(
      '/v1/chaves-de-api',
      {
        preHandler: exigirPermissao('GERENCIAR_CHAVES_DE_API'),
        schema: { response: { 200: z.object({ itens: z.array(ChaveDeApiDto) }) } },
      },
      async (request) => ({ itens: await chaves.listar(contextoDe(request)) }),
    );

    app.post(
      '/v1/chaves-de-api',
      {
        preHandler: exigirPermissao('GERENCIAR_CHAVES_DE_API'),
        schema: { body: CorpoDeNovaChave, response: { 201: RespostaDeNovaChave } },
      },
      async (request, reply) =>
        reply.code(201).send(await chaves.criar(contextoDe(request), request.body)),
    );

    app.delete(
      '/v1/chaves-de-api/:id',
      { preHandler: exigirPermissao('GERENCIAR_CHAVES_DE_API'), schema: { params: ParametroId } },
      async (request, reply) => {
        await chaves.revogar(contextoDe(request), request.params.id);
        return reply.code(204).send();
      },
    );

    // --- Webhooks ---
    app.get(
      '/v1/webhooks',
      {
        preHandler: exigirPermissao('GERENCIAR_WEBHOOKS'),
        schema: { response: { 200: z.object({ itens: z.array(WebhookDto) }) } },
      },
      async (request) => ({ itens: await webhooks.listar(contextoDe(request)) }),
    );

    app.post(
      '/v1/webhooks',
      {
        preHandler: exigirPermissao('GERENCIAR_WEBHOOKS'),
        schema: { body: CorpoDeNovoWebhook, response: { 201: RespostaDeNovoWebhook } },
      },
      async (request, reply) =>
        reply.code(201).send(await webhooks.cadastrar(contextoDe(request), request.body)),
    );

    app.patch(
      '/v1/webhooks/:id',
      {
        preHandler: exigirPermissao('GERENCIAR_WEBHOOKS'),
        schema: {
          params: ParametroId,
          body: CorpoDeAlteracaoDeWebhook,
          response: { 200: WebhookDto },
        },
      },
      async (request) => webhooks.alterar(contextoDe(request), request.params.id, request.body),
    );

    app.delete(
      '/v1/webhooks/:id',
      { preHandler: exigirPermissao('GERENCIAR_WEBHOOKS'), schema: { params: ParametroId } },
      async (request, reply) => {
        await webhooks.remover(contextoDe(request), request.params.id);
        return reply.code(204).send();
      },
    );

    // --- Plano ---
    app.get(
      '/v1/plano',
      { preHandler: exigirPermissao('LER'), schema: { response: { 200: PlanoDto } } },
      async (request) => plano.obter(contextoDe(request)),
    );
  };
