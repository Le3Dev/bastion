import { ConsultaDeRelatorio, ParametroId, RelatorioResumoDto } from '@bastion/contratos';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { Servicos } from '../../rotas';

type Formato = 'json' | 'html' | 'pdf';

/** `?formato=` vence; sem ele, o cabeçalho `Accept` decide; o padrão é JSON. */
const escolherFormato = (formato: Formato | undefined, request: FastifyRequest): Formato => {
  if (formato) return formato;
  const aceito = request.headers.accept ?? '';
  if (aceito.includes('application/pdf')) return 'pdf';
  if (aceito.includes('text/html')) return 'html';
  return 'json';
};

export const rotasDeRelatorios =
  (servicos: Servicos): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/v1/relatorios',
      {
        preHandler: exigirPermissao('LER'),
        schema: {
          querystring: z.object({ avaliacaoId: z.uuid().optional() }),
          response: { 200: z.object({ itens: z.array(RelatorioResumoDto) }) },
        },
      },
      async (request) => ({
        itens: await servicos.relatorios.listar(contextoDe(request), {
          avaliacaoId: request.query.avaliacaoId,
        }),
      }),
    );

    // Sem schema de resposta: a mesma rota devolve JSON (RelatorioDto), HTML ou PDF.
    app.get(
      '/v1/relatorios/:id',
      {
        preHandler: exigirPermissao('LER'),
        schema: { params: ParametroId, querystring: ConsultaDeRelatorio },
      },
      async (request, reply) => {
        const contexto = contextoDe(request);
        const { id } = request.params;
        const formato = escolherFormato(request.query.formato, request);
        if (formato === 'html') {
          const html = await servicos.relatorios.obterHtml(contexto, id);
          return reply.type('text/html; charset=utf-8').send(html);
        }
        if (formato === 'pdf') {
          const pdf = await servicos.relatorios.gerarPdf(contexto, id);
          return reply
            .type('application/pdf')
            .header('Content-Disposition', `inline; filename="relatorio-${id}.pdf"`)
            .send(pdf);
        }
        return servicos.relatorios.obter(contexto, id);
      },
    );
  };
