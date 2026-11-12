import {
  AvaliacaoDto,
  ConsultaDeAvaliacoes,
  CorpoDeSolicitacaoDeAvaliacao,
  esquemaDePagina,
  ParametroId,
  RequisicaoDoGuardiaoDto,
  RespostaDeParada,
  RespostaDeSolicitacao,
  type EventoAoVivo,
} from '@bastion/contratos';
import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contextoDe, exigirPermissao } from '../../compartilhado/autenticacao/autenticacao';
import type { ServicoDeAvaliacoes } from '../aplicacao/ServicoDeAvaliacoes';
import { ehEstadoFinalDaAvaliacao } from '../dominio/EstadoDaAvaliacao';
import type { AoVivo } from './ao-vivo';

export const INTERVALO_DO_HEARTBEAT_EM_MS = 15_000;

const formatarEvento = (evento: EventoAoVivo): string =>
  `event: ${evento.tipo}\ndata: ${JSON.stringify(evento.dados)}\n\n`;

export const rotasDeAvaliacoes =
  (avaliacoes: ServicoDeAvaliacoes, aoVivo: AoVivo): FastifyPluginAsyncZod =>
  async (app) => {
    /** Encerradores dos streams SSE abertos: o fechamento da aplicação não espera por eles. */
    const streamsAbertos = new Set<() => void>();
    app.addHook('onClose', async () => {
      for (const encerrar of [...streamsAbertos]) encerrar();
    });

    app.get(
      '/v1/avaliacoes',
      {
        preHandler: exigirPermissao('LER'),
        schema: { querystring: ConsultaDeAvaliacoes, response: { 200: esquemaDePagina(AvaliacaoDto) } },
      },
      async (request) => avaliacoes.listar(contextoDe(request), request.query),
    );

    app.post(
      '/v1/avaliacoes',
      {
        preHandler: exigirPermissao('SOLICITAR_AVALIACAO'),
        schema: { body: CorpoDeSolicitacaoDeAvaliacao, response: { 202: RespostaDeSolicitacao } },
      },
      async (request, reply) => {
        const cabecalho = request.headers['x-bastion-origem'];
        const resposta = await avaliacoes.solicitar(
          contextoDe(request),
          request.body,
          Array.isArray(cabecalho) ? cabecalho[0] : cabecalho,
        );
        return reply.code(202).send(resposta);
      },
    );

    app.get(
      '/v1/avaliacoes/:id',
      {
        preHandler: exigirPermissao('LER'),
        schema: { params: ParametroId, response: { 200: AvaliacaoDto } },
      },
      async (request) => avaliacoes.obter(contextoDe(request), request.params.id),
    );

    app.get(
      '/v1/avaliacoes/:id/requisicoes',
      {
        preHandler: exigirPermissao('LER'),
        schema: {
          params: ParametroId,
          response: { 200: z.object({ itens: z.array(RequisicaoDoGuardiaoDto) }) },
        },
      },
      async (request) => ({
        itens: await avaliacoes.requisicoes(contextoDe(request), request.params.id),
      }),
    );

    app.post(
      '/v1/avaliacoes/:id/parar',
      {
        preHandler: exigirPermissao('PARAR_AVALIACAO'),
        schema: { params: ParametroId, response: { 200: RespostaDeParada } },
      },
      async (request) => avaliacoes.parar(contextoDe(request), request.params.id),
    );

    app.get(
      '/v1/avaliacoes/:id/eventos',
      { preHandler: exigirPermissao('LER'), schema: { params: ParametroId } },
      async (request, reply) => {
        const contexto = contextoDe(request);
        const id = request.params.id;
        // Autorização e existência são conferidas ANTES de abrir o stream (erro vira 404 normal).
        await avaliacoes.obter(contexto, id);

        // Assume a resposta: `reply.getHeaders()` leva junto os cabeçalhos do CORS (com credenciais).
        const cabecalhos: OutgoingHttpHeaders = {};
        for (const [nome, valor] of Object.entries(reply.getHeaders())) {
          if (valor !== undefined) cabecalhos[nome] = valor;
        }
        reply.hijack();
        const bruto = reply.raw;
        bruto.writeHead(200, {
          ...cabecalhos,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        bruto.write(': conectado\n\n');

        let encerrado = false;
        let cancelarAssinatura: (() => Promise<void>) | null = null;
        const heartbeat = setInterval(() => {
          if (!encerrado) bruto.write(': keepalive\n\n');
        }, INTERVALO_DO_HEARTBEAT_EM_MS);

        const encerrar = (): void => {
          if (encerrado) return;
          encerrado = true;
          clearInterval(heartbeat);
          streamsAbertos.delete(encerrar);
          if (cancelarAssinatura) void cancelarAssinatura().catch(() => undefined);
          if (!bruto.writableEnded) bruto.end();
        };
        streamsAbertos.add(encerrar);
        request.raw.on('close', encerrar);

        const enviar = (evento: EventoAoVivo): void => {
          if (encerrado) return;
          bruto.write(formatarEvento(evento));
          if (evento.tipo === 'avaliacao' && ehEstadoFinalDaAvaliacao(evento.dados.estado)) {
            encerrar();
          }
        };

        try {
          // Assina ANTES de ler o estado atual: nenhum evento entre os dois passos se perde.
          cancelarAssinatura = await aoVivo.assinar(id, enviar);
          if (encerrado) {
            await cancelarAssinatura().catch(() => undefined);
            return;
          }
          enviar({ tipo: 'avaliacao', dados: await avaliacoes.obter(contexto, id) });
        } catch (erro) {
          request.log.error({ err: erro }, 'Falha ao abrir o stream de eventos da avaliação.');
          encerrar();
        }
      },
    );
  };
