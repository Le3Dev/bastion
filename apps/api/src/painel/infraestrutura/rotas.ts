import { PainelDto } from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { ServicoDePainel } from '../aplicacao/ServicoDePainel';

export const rotasDoPainel =
  (painel: ServicoDePainel): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/painel',
      { preHandler: exigirPermissao('LER'), schema: { response: { 200: PainelDto } } },
      async (request) => painel.obter(contextoDe(request)),
    );
  };
