import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { semContexto } from './banco/conexao';
import type { Dependencias } from './dependencias';
import { ErroDeAplicacao } from './erros';

export const rotasDeSaude =
  (dependencias: Dependencias): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/saude',
      { config: { rateLimit: false }, schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
      async () => {
        try {
          await semContexto(dependencias.db, (tx) => tx.execute(sql`select 1`));
          await dependencias.filas.verificarSaude();
        } catch {
          throw new ErroDeAplicacao(
            503,
            'SERVICO_INDISPONIVEL',
            'O banco de dados ou o Redis não está respondendo.',
          );
        }
        return { ok: true as const };
      },
    );
  };
