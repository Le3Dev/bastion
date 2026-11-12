import { describe, expect, it } from 'vitest';
import { carregarConfig } from './config';

const ambiente = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  S3_ENDPOINT: 'http://s3',
  S3_REGIAO: 'us-east-1',
  S3_CHAVE_DE_ACESSO: 'a',
  S3_SEGREDO: 'b',
  S3_BUCKET_RELATORIOS: 'c',
};

describe('carregarConfig', () => {
  it('aplica os padrões', () => {
    const config = carregarConfig(ambiente);
    expect(config.portaDaApi).toBe(3333);
    expect(config.origemDaWeb).toBe('http://localhost:3000');
    expect(config.sessaoCookieSeguro).toBe(false);
    expect(config.sessaoDuracaoHoras).toBe(12);
    expect(config.limiteDeTaxaAtivo).toBe(true);
  });

  it('lê valores informados', () => {
    const config = carregarConfig({
      ...ambiente,
      API_PORTA: '4000',
      SESSAO_COOKIE_SEGURO: 'true',
      API_LIMITE_DE_TAXA: 'false',
    });
    expect(config.portaDaApi).toBe(4000);
    expect(config.sessaoCookieSeguro).toBe(true);
    expect(config.limiteDeTaxaAtivo).toBe(false);
  });

  it('lista as variáveis faltantes na mensagem de erro', () => {
    expect(() => carregarConfig({ DATABASE_URL: 'x' })).toThrow(/REDIS_URL/);
  });
});
