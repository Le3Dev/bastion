import { sql } from 'drizzle-orm';
import { criarAplicacao } from './aplicacao';
import { criarConexao } from './compartilhado/banco/conexao';
import { carregarConfig } from './compartilhado/config';
import { PublicadorDoOutbox } from './compartilhado/outbox/outbox';
import { relogioDoSistema } from './compartilhado/relogio';
import { criarArmazenamento } from './integracoes/armazenamento';
import { iniciarConsumidorDeResultados } from './integracoes/consumidor-de-resultados';
import { criarFilas } from './integracoes/filas';

const enderecoSemSegredo = (url: string): string => {
  try {
    const analisada = new URL(url);
    return `${analisada.hostname}:${analisada.port || 'porta padrão'}`;
  } catch {
    return url;
  }
};

const descreverErro = (erro: unknown): string => {
  if (erro instanceof AggregateError) return erro.errors.map(descreverErro).join('; ');
  if (erro instanceof Error) return erro.message || erro.name;
  return String(erro);
};

async function principal(): Promise<void> {
  const config = carregarConfig();
  const conexao = criarConexao(config.databaseUrl);
  const filas = criarFilas(config.redisUrl);
  const armazenamento = criarArmazenamento(config.s3);

  try {
    await conexao.db.execute(sql`select 1`);
  } catch (erro) {
    throw new Error(
      `Não foi possível conectar ao Postgres em ${enderecoSemSegredo(config.databaseUrl)}; rode \`pnpm infra:subir\`. (${descreverErro(erro)})`,
    );
  }
  try {
    await filas.verificarSaude();
  } catch (erro) {
    throw new Error(
      `Não foi possível conectar ao Redis em ${enderecoSemSegredo(config.redisUrl)}; rode \`pnpm infra:subir\`. (${descreverErro(erro)})`,
    );
  }
  try {
    await armazenamento.garantirBucket();
  } catch (erro) {
    throw new Error(
      `Não foi possível preparar o armazenamento S3 em ${enderecoSemSegredo(config.s3.endpoint)}; rode \`pnpm infra:subir\`. (${descreverErro(erro)})`,
    );
  }

  const app = await criarAplicacao({ config, db: conexao.db, filas, relogio: relogioDoSistema });
  const publicador = new PublicadorDoOutbox(conexao.db, relogioDoSistema, (mensagem, erro) =>
    app.log.error({ err: erro }, mensagem),
  );
  publicador.iniciar();
  const consumidor = iniciarConsumidorDeResultados(conexao.db, config.redisUrl, (mensagem, erro) =>
    app.log.error({ err: erro }, mensagem),
  );

  let encerrando = false;
  const encerrar = async (sinal: string): Promise<void> => {
    if (encerrando) return;
    encerrando = true;
    app.log.info(`Recebi ${sinal}; encerrando.`);
    try {
      await publicador.parar();
      await consumidor.fechar();
      await app.close();
      await filas.fechar();
      armazenamento.fechar();
      await conexao.fechar();
      process.exitCode = 0;
    } catch (erro) {
      console.error(`Falha ao encerrar com segurança: ${descreverErro(erro)}`);
      process.exitCode = 1;
    }
  };
  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));

  await app.listen({ port: config.portaDaApi, host: '0.0.0.0' });
}

try {
  await principal();
} catch (erro) {
  console.error(`Falha ao iniciar a API: ${descreverErro(erro)}`);
  process.exitCode = 1;
  // Conexões abertas (pool, Redis, BullMQ) manteriam o processo vivo.
  setTimeout(() => process.exit(1), 100).unref();
}
