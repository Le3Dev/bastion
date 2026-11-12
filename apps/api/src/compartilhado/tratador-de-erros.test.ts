import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import { describe, expect, it } from 'vitest';
import { ErroDeAplicacao, conflito, naoAutenticado, naoEncontrado, tempoEsgotado } from './erros';
import { MENSAGEM_DE_ERRO_INTERNO, mapearErro } from './tratador-de-erros';

describe('mapearErro', () => {
  it('ErroDeAplicacao mantém o status e o código', () => {
    const mapeado = mapearErro(new ErroDeAplicacao(418, 'CHA', 'Sou um bule.'));
    expect(mapeado.status).toBe(418);
    expect(mapeado.corpo).toEqual({ erro: { codigo: 'CHA', mensagem: 'Sou um bule.' } });
    expect(mapeado.inesperado).toBe(false);
  });

  it('fábricas de erro usam os status esperados', () => {
    expect(mapearErro(naoEncontrado('Sistema')).status).toBe(404);
    expect(mapearErro(naoEncontrado('Sistema')).corpo.erro.mensagem).toBe('Sistema não encontrado.');
    expect(mapearErro(naoAutenticado()).status).toBe(401);
    expect(mapearErro(conflito('Já existe.')).status).toBe(409);
    expect(mapearErro(tempoEsgotado('Demorou.')).status).toBe(504);
  });

  it('PERMISSAO_NEGADA vira 403', () => {
    expect(mapearErro(new ErroDeDominio('Sem permissão.', 'PERMISSAO_NEGADA')).status).toBe(403);
  });

  it('código terminado em NAO_ENCONTRADO vira 404', () => {
    expect(mapearErro(new ErroDeDominio('Sumiu.', 'MEMBRO_NAO_ENCONTRADO')).status).toBe(404);
  });

  it('demais erros de domínio viram 422 com o código do domínio', () => {
    const mapeado = mapearErro(new ErroDeDominio('Produção não.', 'HOMOLOGACAO_EM_PRODUCAO'));
    expect(mapeado.status).toBe(422);
    expect(mapeado.corpo.erro.codigo).toBe('HOMOLOGACAO_EM_PRODUCAO');
  });

  it('limite de taxa vira 429 com a mensagem combinada', () => {
    const erro = Object.assign(new Error('rate limit'), { statusCode: 429 });
    const mapeado = mapearErro(erro);
    expect(mapeado.status).toBe(429);
    expect(mapeado.corpo.erro.mensagem).toBe('Muitas tentativas; aguarde um minuto.');
  });

  it('erro 4xx do Fastify vira requisição inválida sem vazar a mensagem original', () => {
    const erro = Object.assign(new Error('detalhe interno'), { statusCode: 400 });
    const mapeado = mapearErro(erro);
    expect(mapeado.status).toBe(400);
    expect(mapeado.corpo.erro.mensagem).not.toContain('detalhe interno');
  });

  it('erro desconhecido vira 500 genérico e é marcado para log', () => {
    const mapeado = mapearErro(new Error('senha do banco: 123'));
    expect(mapeado.status).toBe(500);
    expect(mapeado.corpo).toEqual({
      erro: { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_DE_ERRO_INTERNO },
    });
    expect(mapeado.inesperado).toBe(true);
    expect(JSON.stringify(mapeado.corpo)).not.toContain('senha do banco');
  });
});
