import {
  CorpoDeCadastroDeSistema,
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
