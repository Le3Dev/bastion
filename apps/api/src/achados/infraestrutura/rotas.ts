import {
  AchadoDto,
  AchadoResumoDto,
  ConsultaDeAchados,
  ConsultaPaginada,
  CorpoDeMudancaDeEstado,
  ParametroId,
  RespostaDeMudancaDeEstado,
  RespostaDeRevalidacao,
  esquemaDePagina,
} from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { Servicos } from '../../rotas';

const ConsultaDeAchadosDaAvaliacao = ConsultaPaginada.extend({ severidade: z.string().optional() });

export const rotasDeAchados =
  (servicos: Servicos): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/achados',
      {
        preHandler: exigirPermissao('LER'),
        schema: { querystring: ConsultaDeAchados, response: { 200: esquemaDePagina(AchadoResumoDto) } },
      },
      async (request) => servicos.achados.listar(contextoDe(request), request.query),
    );

    app.get(
      '/v1/achados/:id',
      {
        preHandler: exigirPermissao('LER'),
        schema: { params: ParametroId, response: { 200: AchadoDto } },
      },
      async (request) => servicos.achados.obter(contextoDe(request), request.params.id),
    );

    // A permissão específica depende do estado de destino e é conferida no serviço.
    app.patch(
      '/v1/achados/:id',
      {
        preHandler: exigirPermissao('LER'),
        schema: {
          params: ParametroId,
          body: CorpoDeMudancaDeEstado,
          response: { 200: RespostaDeMudancaDeEstado },
        },
      },
      async (request) =>
        servicos.achados.mudarEstado(contextoDe(request), request.params.id, request.body),
    );

    app.post(
      '/v1/achados/:id/revalidar',
      {
        preHandler: exigirPermissao('CORRIGIR_ACHADO'),
        schema: { params: ParametroId, response: { 202: RespostaDeRevalidacao } },
      },
      async (request, reply) => {
        const resposta = await servicos.achados.revalidar(
          contextoDe(request),
          request.params.id,
          (contexto, dados) => servicos.avaliacoes.solicitarParaRevalidacao(contexto, dados),
        );
        return reply.code(202).send(resposta);
      },
    );

    app.get(
      '/v1/avaliacoes/:id/achados',
      {
        preHandler: exigirPermissao('LER'),
        schema: {
          params: ParametroId,
          querystring: ConsultaDeAchadosDaAvaliacao,
          response: { 200: esquemaDePagina(AchadoResumoDto) },
        },
      },
      async (request) =>
        servicos.achados.listarDaAvaliacao(contextoDe(request), request.params.id, request.query),
    );
  };
