import { z } from 'zod';

const Booleano = (padrao: boolean) =>
  z
    .enum(['true', 'false'])
    .default(padrao ? 'true' : 'false')
    .transform((valor) => valor === 'true');

const EsquemaDoAmbiente = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_REGIAO: z.string().min(1),
  S3_CHAVE_DE_ACESSO: z.string().min(1),
  S3_SEGREDO: z.string().min(1),
  S3_BUCKET_RELATORIOS: z.string().min(1),
  API_PORTA: z.coerce.number().int().min(1).max(65535).default(3333),
  API_ORIGEM_WEB: z.string().min(1).default('http://localhost:3000'),
  SESSAO_COOKIE_SEGURO: Booleano(false),
  SESSAO_DURACAO_HORAS: z.coerce.number().positive().default(12),
  API_LIMITE_DE_TAXA: Booleano(true),
});

export interface Config {
  databaseUrl: string;
  redisUrl: string;
  s3: {
    endpoint: string;
    regiao: string;
    chaveDeAcesso: string;
    segredo: string;
    bucketDeRelatorios: string;
  };
  portaDaApi: number;
  origemDaWeb: string;
  sessaoCookieSeguro: boolean;
  sessaoDuracaoHoras: number;
  limiteDeTaxaAtivo: boolean;
}

export const carregarConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const resultado = EsquemaDoAmbiente.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `${problema.path.join('.') || '(raiz)'}: ${problema.message}`)
      .join('; ');
    const faltantes = resultado.error.issues
      .filter((problema) => problema.code === 'invalid_type')
      .map((problema) => problema.path.join('.'));
    throw new Error(
      `Configuração inválida do ambiente. Variáveis faltantes ou incorretas: ${
        faltantes.length > 0 ? faltantes.join(', ') : problemas
      }. Detalhes: ${problemas}. Copie .env.example para .env.`,
    );
  }
  const e = resultado.data;
  return {
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    s3: {
      endpoint: e.S3_ENDPOINT,
      regiao: e.S3_REGIAO,
      chaveDeAcesso: e.S3_CHAVE_DE_ACESSO,
      segredo: e.S3_SEGREDO,
      bucketDeRelatorios: e.S3_BUCKET_RELATORIOS,
    },
    portaDaApi: e.API_PORTA,
    origemDaWeb: e.API_ORIGEM_WEB,
    sessaoCookieSeguro: e.SESSAO_COOKIE_SEGURO,
    sessaoDuracaoHoras: e.SESSAO_DURACAO_HORAS,
    limiteDeTaxaAtivo: e.API_LIMITE_DE_TAXA,
  };
};
