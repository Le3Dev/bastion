import {
  ConsultaDeAuditoria,
  esquemaDePagina,
  RegistroDeAuditoriaDto,
} from '@bastion/contratos';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import { emContextoDaOrganizacao } from '../../compartilhado/banco/conexao';
import type { Dependencias } from '../../compartilhado/dependencias';
import type { ServicoDeAuditoria } from '../aplicacao/ServicoDeAuditoria';

export const rotasDeAuditoria =
  (dependencias: Dependencias, auditoria: ServicoDeAuditoria): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/auditoria',
      {
        preHandler: exigirPermissao('VER_AUDITORIA'),
        schema: {
          querystring: ConsultaDeAuditoria,
          response: { 200: esquemaDePagina(RegistroDeAuditoriaDto) },
        },
      },
      async (request) => {
        const contexto = contextoDe(request);
        return emContextoDaOrganizacao(dependencias.db, contexto.organizacaoId, (tx) =>
          auditoria.listar(tx, contexto.organizacaoId, request.query),
        );
      },
    );
  };
