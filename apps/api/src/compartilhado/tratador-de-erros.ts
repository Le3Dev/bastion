import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ErroDeAplicacao } from './erros';

export interface CorpoDeErro {
  erro: { codigo: string; mensagem: string; detalhes?: unknown };
}

export interface ErroMapeado {
  status: number;
  corpo: CorpoDeErro;
  /** Verdadeiro quando o erro é inesperado e deve ir para o log. */
  inesperado: boolean;
}

export const MENSAGEM_DE_ERRO_INTERNO =
  'Erro interno. Tente novamente; se persistir, contate o suporte.';

const montar = (
  status: number,
  codigo: string,
  mensagem: string,
  detalhes?: unknown,
): ErroMapeado => ({
  status,
  corpo: { erro: detalhes === undefined ? { codigo, mensagem } : { codigo, mensagem, detalhes } },
  inesperado: false,
});

const statusDe = (erro: unknown): number | undefined => {
  if (typeof erro === 'object' && erro !== null && 'statusCode' in erro) {
    const valor = (erro as { statusCode: unknown }).statusCode;
    return typeof valor === 'number' ? valor : undefined;
  }
  return undefined;
};

/** Converte qualquer erro no formato único `{ erro: { codigo, mensagem, detalhes? } }`. */
export const mapearErro = (erro: unknown): ErroMapeado => {
  if (hasZodFastifySchemaValidationErrors(erro)) {
    const detalhes = erro.validation.map((problema) => ({
      campo: problema.instancePath.replace(/^\//, '').replaceAll('/', '.'),
      mensagem: problema.message ?? 'Valor inválido.',
    }));
    return montar(400, 'VALIDACAO', 'Os dados enviados são inválidos.', detalhes);
  }
  if (erro instanceof ErroDeAplicacao) {
    return montar(erro.status, erro.codigo, erro.message, erro.detalhes);
  }
  if (erro instanceof ErroDeDominio) {
    if (erro.codigo === 'PERMISSAO_NEGADA') return montar(403, erro.codigo, erro.message);
    if (erro.codigo.endsWith('NAO_ENCONTRADO')) return montar(404, erro.codigo, erro.message);
    return montar(422, erro.codigo, erro.message);
  }
  const status = statusDe(erro);
  if (status === 429) {
    return montar(429, 'LIMITE_DE_TAXA', 'Muitas tentativas; aguarde um minuto.');
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return montar(status, 'REQUISICAO_INVALIDA', 'Requisição inválida.');
  }
  return {
    status: 500,
    corpo: { erro: { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_DE_ERRO_INTERNO } },
    inesperado: true,
  };
};

export const registrarTratadorDeErros = (app: FastifyInstance): void => {
  app.setErrorHandler((erro, request, reply) => {
    const mapeado = mapearErro(erro);
    if (mapeado.inesperado) {
      request.log.error({ err: erro }, 'Erro inesperado ao tratar a requisição.');
    }
    return reply.status(mapeado.status).send(mapeado.corpo);
  });
  app.setNotFoundHandler((_request, reply) =>
    reply
      .status(404)
      .send({ erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' } }),
  );
};
