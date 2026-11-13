import {
  AgendamentoDto,
  CorpoDeAlteracaoDeAgendamento,
  CorpoDeNovoAgendamento,
  ParametroId,
} from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { ServicoDeAgendamentos } from '../aplicacao/ServicoDeAgendamentos';

export const rotasDeAgendamentos =
  (agendamentos: ServicoDeAgendamentos): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/agendamentos',
      {
        preHandler: exigirPermissao('LER'),
        schema: { response: { 200: z.object({ itens: z.array(AgendamentoDto) }) } },
      },
      async (request) => ({ itens: await agendamentos.listar(contextoDe(request)) }),
    );

    app.post(
      '/v1/agendamentos',
      {
        preHandler: exigirPermissao('SOLICITAR_AVALIACAO'),
        schema: { body: CorpoDeNovoAgendamento, response: { 201: AgendamentoDto } },
      },
      async (request, reply) => {
        const criado = await agendamentos.criar(contextoDe(request), request.body);
        return reply.code(201).send(criado);
      },
    );

    app.patch(
      '/v1/agendamentos/:id',
      {
        preHandler: exigirPermissao('SOLICITAR_AVALIACAO'),
        schema: {
          params: ParametroId,
          body: CorpoDeAlteracaoDeAgendamento,
          response: { 200: AgendamentoDto },
        },
      },
      async (request) =>
        agendamentos.alterar(contextoDe(request), request.params.id, request.body),
    );

    app.delete(
      '/v1/agendamentos/:id',
      {
        preHandler: exigirPermissao('SOLICITAR_AVALIACAO'),
        schema: { params: ParametroId, response: { 204: z.null() } },
      },
      async (request, reply) => {
        await agendamentos.remover(contextoDe(request), request.params.id);
        return reply.code(204).send(null);
      },
    );
  };
