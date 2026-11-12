import {
  CorpoDeCadastroDeSistema,
  CorpoDeConectorDeIa,
  CorpoDeCredencialDeTeste,
  CorpoDeVerificacao,
  InstrucoesDeVerificacaoDto,
  ParametroId,
  RespostaDeCadastroDeSistema,
  RespostaDeVerificacao,
  SistemaDto,
} from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { ServicoDeSistemas } from '../aplicacao/ServicoDeSistemas';

export const rotasDeSistemas =
  (sistemas: ServicoDeSistemas): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/sistemas',
      {
        preHandler: exigirPermissao('LER'),
        schema: { response: { 200: z.object({ itens: z.array(SistemaDto) }) } },
      },
      async (request) => ({ itens: await sistemas.listar(contextoDe(request)) }),
    );

    app.post(
      '/v1/sistemas',
      {
        preHandler: exigirPermissao('CADASTRAR_SISTEMA'),
        schema: { body: CorpoDeCadastroDeSistema, response: { 201: RespostaDeCadastroDeSistema } },
      },
      async (request, reply) => {
        const resposta = await sistemas.cadastrar(contextoDe(request), request.body);
        return reply.code(201).send(resposta);
      },
    );

    app.get(
      '/v1/sistemas/:id',
      {
        preHandler: exigirPermissao('LER'),
        schema: { params: ParametroId, response: { 200: SistemaDto } },
      },
      async (request) => sistemas.obter(contextoDe(request), request.params.id),
    );

    app.get(
      '/v1/sistemas/:id/verificacao',
      {
        preHandler: exigirPermissao('LER'),
        schema: { params: ParametroId, response: { 200: InstrucoesDeVerificacaoDto } },
      },
      async (request) => sistemas.instrucoes(contextoDe(request), request.params.id),
    );

    app.put(
      '/v1/sistemas/:id/credencial-de-teste',
      {
        preHandler: exigirPermissao('CADASTRAR_SISTEMA'),
        schema: { params: ParametroId, body: CorpoDeCredencialDeTeste, response: { 200: SistemaDto } },
      },
      async (request) =>
        sistemas.definirCredencialDeTeste(contextoDe(request), request.params.id, request.body),
    );

    app.delete(
      '/v1/sistemas/:id/credencial-de-teste',
      {
        preHandler: exigirPermissao('CADASTRAR_SISTEMA'),
        schema: { params: ParametroId, response: { 200: SistemaDto } },
      },
      async (request) => sistemas.removerCredencialDeTeste(contextoDe(request), request.params.id),
    );

    app.put(
      '/v1/sistemas/:id/conector-de-ia',
      {
        preHandler: exigirPermissao('CADASTRAR_SISTEMA'),
        schema: { params: ParametroId, body: CorpoDeConectorDeIa, response: { 200: SistemaDto } },
      },
      async (request) =>
        sistemas.definirConectorDeIa(contextoDe(request), request.params.id, request.body),
    );

    app.delete(
      '/v1/sistemas/:id/conector-de-ia',
      {
        preHandler: exigirPermissao('CADASTRAR_SISTEMA'),
        schema: { params: ParametroId, response: { 200: SistemaDto } },
      },
      async (request) => sistemas.removerConectorDeIa(contextoDe(request), request.params.id),
    );

    app.patch(
      '/v1/sistemas/:id/consentimento-de-dados',
      {
        preHandler: exigirPermissao('CADASTRAR_SISTEMA'),
        schema: {
          params: ParametroId,
          body: z.object({ permitir: z.boolean() }),
          response: { 200: SistemaDto },
        },
      },
      async (request) =>
        sistemas.definirConsentimentoDeDados(
          contextoDe(request),
          request.params.id,
          request.body.permitir,
        ),
    );

    app.post(
      '/v1/sistemas/:id/verificacao',
      {
        preHandler: exigirPermissao('VERIFICAR_SISTEMA'),
        schema: {
          params: ParametroId,
          body: CorpoDeVerificacao.default({}),
          response: { 200: RespostaDeVerificacao },
        },
      },
      async (request) =>
        sistemas.verificar(contextoDe(request), request.params.id, request.body),
    );
  };
