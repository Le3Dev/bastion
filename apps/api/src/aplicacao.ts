import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { criarAoVivo } from './avaliacoes/infraestrutura/ao-vivo';
import { registrarManipuladoresDeResultado } from './avaliacoes/infraestrutura/manipuladores-de-resultado';
import { pluginDeAutenticacao } from './compartilhado/autenticacao/autenticacao';
import { criarConexao } from './compartilhado/banco/conexao';
import { carregarConfig } from './compartilhado/config';
import type { Dependencias } from './compartilhado/dependencias';
import { relogioDoSistema } from './compartilhado/relogio';
import { registrarTratadorDeErros } from './compartilhado/tratador-de-erros';
import { criarArmazenamento } from './integracoes/armazenamento';
import { criarFilas } from './integracoes/filas';
import { criarServicos, registrarRotas } from './rotas';

/**
 * Monta a aplicação Fastify. Qualquer dependência não informada é criada a partir do ambiente;
 * os testes injetam banco de teste, filas falsas e relógio fixo.
 */
export const criarAplicacao = async (
  informadas: Partial<Dependencias> = {},
): Promise<FastifyInstance> => {
  const config = informadas.config ?? carregarConfig();
  const conexaoPropria = informadas.db ? undefined : criarConexao(config.databaseUrl);
  const filasProprias = informadas.filas ? undefined : criarFilas(config.redisUrl);
  const armazenamentoProprio = informadas.armazenamento ? undefined : criarArmazenamento(config.s3);
  const aoVivoProprio = informadas.aoVivo ? undefined : criarAoVivo(config.redisUrl);
  const dependencias: Dependencias = {
    config,
    db: informadas.db ?? (conexaoPropria as NonNullable<typeof conexaoPropria>).db,
    filas: informadas.filas ?? (filasProprias as NonNullable<typeof filasProprias>),
    relogio: informadas.relogio ?? relogioDoSistema,
    armazenamento:
      informadas.armazenamento ?? (armazenamentoProprio as NonNullable<typeof armazenamentoProprio>),
    aoVivo: informadas.aoVivo ?? (aoVivoProprio as NonNullable<typeof aoVivoProprio>),
  };

  const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test' });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: config.origemDaWeb,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie);
  if (config.limiteDeTaxaAtivo) {
    await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  }
  await app.register(pluginDeAutenticacao, {
    db: dependencias.db,
    config,
    relogio: dependencias.relogio,
  });
  registrarTratadorDeErros(app);

  const servicos = criarServicos(dependencias);
  servicos.webhooks.registrarManipuladores();
  servicos.avaliacoes.registrarManipuladores();
  registrarManipuladoresDeResultado({
    relogio: dependencias.relogio,
    auditoria: servicos.auditoria,
    sistemas: servicos.sistemas,
    avaliacoes: servicos.avaliacoes,
    achados: servicos.achados,
    relatorios: servicos.relatorios,
    aoVivo: dependencias.aoVivo,
    registrarAviso: (mensagem) => app.log.warn(mensagem),
  });
  app.decorate('servicos', servicos);
  registrarRotas(app, dependencias, servicos);

  app.addHook('onClose', async () => {
    if (aoVivoProprio) await aoVivoProprio.fechar();
    armazenamentoProprio?.fechar();
    if (filasProprias) await filasProprias.fechar();
    if (conexaoPropria) await conexaoPropria.fechar();
  });

  return app;
};
