import { z } from 'zod';

const textoBooleano = z
  .enum(['true', 'false'], { error: 'deve ser "true" ou "false".' })
  .default('false')
  .transform((valor) => valor === 'true');

const EsquemaDoAmbiente = z.object({
  REDIS_URL: z.string({ error: 'é obrigatória (ex.: redis://localhost:6379).' }).min(1, 'é obrigatória.'),
  GUARDIAO_PERMITIR_REDES_PRIVADAS: textoBooleano,
  GUARDIAO_REQUISICOES_POR_SEGUNDO: z.coerce
    .number({ error: 'deve ser um número.' })
    .positive('deve ser maior que zero.')
    .max(50, 'deve ser no máximo 50.')
    .default(5),
  WORKER_CONCORRENCIA_AVALIACOES: z.coerce
    .number({ error: 'deve ser um número.' })
    .int('deve ser inteiro.')
    .min(1, 'deve ser no mínimo 1.')
    .max(32, 'deve ser no máximo 32.')
    .default(2),
});

export interface ConfigDoWorker {
  redisUrl: string;
  permitirRedesPrivadas: boolean;
  requisicoesPorSegundo: number;
  concorrenciaDeAvaliacoes: number;
}

/** Lê e valida o ambiente. Variáveis vazias valem como ausentes. */
export function lerConfig(
  ambiente: Record<string, string | undefined> = process.env,
  avisar: (mensagem: string) => void = (mensagem) => console.warn(mensagem),
): ConfigDoWorker {
  const limpo: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(ambiente)) {
    if (valor !== undefined && valor.trim() !== '') limpo[chave] = valor.trim();
  }

  const analise = EsquemaDoAmbiente.safeParse(limpo);
  if (!analise.success) {
    const problemas = analise.error.issues.map((problema) => `${problema.path.join('.')} ${problema.message}`);
    throw new Error(`Configuração do worker inválida: ${problemas.join(' ')}`);
  }

  const dados = analise.data;
  if (dados.GUARDIAO_PERMITIR_REDES_PRIVADAS) {
    avisar(
      'AVISO: GUARDIAO_PERMITIR_REDES_PRIVADAS=true libera redes privadas e loopback. Apenas desenvolvimento; proibido em produção.',
    );
  }
  return {
    redisUrl: dados.REDIS_URL,
    permitirRedesPrivadas: dados.GUARDIAO_PERMITIR_REDES_PRIVADAS,
    requisicoesPorSegundo: dados.GUARDIAO_REQUISICOES_POR_SEGUNDO,
    concorrenciaDeAvaliacoes: dados.WORKER_CONCORRENCIA_AVALIACOES,
  };
}
