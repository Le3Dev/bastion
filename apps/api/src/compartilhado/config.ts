import { z } from 'zod';
import { lerChaveDeCifragem } from './cifragem';

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
  CHAVE_DE_CIFRAGEM: z.string().optional(),
});

/** Chave FIXA só para desenvolvimento/testes; nunca use em produção (lá a variável é obrigatória). */
const CHAVE_DE_CIFRAGEM_DE_DESENVOLVIMENTO = Buffer.from(
  'bastion-chave-de-desenvolvimento!',
  'utf8',
).subarray(0, 32);

const resolverChaveDeCifragem = (env: NodeJS.ProcessEnv, valor: string | undefined): Buffer => {
  if (valor !== undefined && valor.trim() !== '') return lerChaveDeCifragem(valor);
  if (env['NODE_ENV'] === 'production') {
    throw new Error(
      'CHAVE_DE_CIFRAGEM é obrigatória em produção (32 bytes em base64 ou hexadecimal). Defina uma chave própria e secreta.',
    );
  }
  if (env['NODE_ENV'] !== 'test') {
    process.emitWarning(
      'CHAVE_DE_CIFRAGEM não definida: usando a chave FIXA de desenvolvimento. Não use em produção.',
    );
  }
  return CHAVE_DE_CIFRAGEM_DE_DESENVOLVIMENTO;
};

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
  /** Chave AES-256 (32 bytes) dos segredos em repouso. */
  chaveDeCifragem: Buffer;
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
    chaveDeCifragem: resolverChaveDeCifragem(env, e.CHAVE_DE_CIFRAGEM),
  };
};
