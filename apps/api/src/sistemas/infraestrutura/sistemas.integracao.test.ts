import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErroDeTempoEsgotadoDaFila } from '../../integracoes/filas';
import {
  cadastrarOrganizacaoDeTeste,
  corpoDeSistema,
  criarAmbienteDeTeste,
  type AmbienteDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';

let ambiente: AmbienteDeTeste;

beforeAll(async () => {
  ambiente = await criarAmbienteDeTeste();
});
beforeEach(async () => {
  await ambiente.limpar();
  ambiente.filas.verificacoes = [];
  ambiente.filas.resultadoDaVerificacao = { verificado: true, mensagem: 'ok' };
});
afterAll(async () => {
  await ambiente.encerrar();
});

interface ErroJson {
  erro: { codigo: string; mensagem: string };
}

const cadastrarSistema = async (cookie: string) => {
  const resposta = await ambiente.app.inject({
    method: 'POST',
    url: '/v1/sistemas',
    headers: { cookie },
    payload: corpoDeSistema(),
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<{
    id: string;
    estadoVerificacao: string;
    verificacao: { token: string; arquivo: { url: string; conteudo: string } };
  }>();
};

describe('cadastro de sistemas', () => {
  it('cadastra um sistema válido e devolve as instruções de verificação', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'sis');
    const cadastro = await cadastrarSistema(cookie);
    expect(cadastro.estadoVerificacao).toBe('PENDENTE');
    expect(cadastro.verificacao.token).toMatch(/^[0-9a-f]{32}$/);
    expect(cadastro.verificacao.arquivo.conteudo).toBe(cadastro.verificacao.token);

    const lista = await ambiente.app.inject({ method: 'GET', url: '/v1/sistemas', headers: { cookie } });
    expect(lista.json<{ itens: { id: string }[] }>().itens.map((s) => s.id)).toEqual([cadastro.id]);

    const detalhe = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${cadastro.id}`,
      headers: { cookie },
    });
    expect(detalhe.statusCode).toBe(200);
    expect(detalhe.json()).toMatchObject({
      nome: 'Portal de homologação',
      verificacao: { estado: 'PENDENTE' },
    });

    const instrucoes = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${cadastro.id}/verificacao`,
      headers: { cookie },
    });
    expect(instrucoes.statusCode).toBe(200);
    expect(instrucoes.json()).toMatchObject({ token: cadastro.verificacao.token });

    const plano = await ambiente.app.inject({ method: 'GET', url: '/v1/plano', headers: { cookie } });
    expect(plano.json()).toMatchObject({
      nome: 'Profissional',
      uso: { sistemas: 1, membros: 1, avaliacoesNoMes: 0 },
    });
  });

  it('recusa homologação dentro do domínio de produção com 422', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'prod');
    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/sistemas',
      headers: { cookie },
      payload: corpoDeSistema({
        urlDeHomologacao: 'https://homolog.producao.cliente.test',
        dominioDeProducao: 'producao.cliente.test',
      }),
    });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<ErroJson>().erro.codigo).toBe('HOMOLOGACAO_EM_PRODUCAO');
  });

  it('registra SISTEMA_CADASTRADO na auditoria', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'aud');
    await cadastrarSistema(cookie);
    const auditoria = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria?acao=SISTEMA_CADASTRADO',
      headers: { cookie },
    });
    const itens = auditoria.json<{ itens: { acao: string; alvo: string; ator: { tipo: string } }[] }>().itens;
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ acao: 'SISTEMA_CADASTRADO', alvo: 'Portal de homologação' });
    expect(itens[0]?.ator.tipo).toBe('USUARIO');
  });
});

describe('isolamento entre organizações', () => {
  it('a organização B não vê nem acessa o sistema da A', async () => {
    const a = await cadastrarOrganizacaoDeTeste(ambiente.app, 'org-a');
    const b = await cadastrarOrganizacaoDeTeste(ambiente.app, 'org-b');
    const sistema = await cadastrarSistema(a.cookie);

    const listaDeB = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/sistemas',
      headers: { cookie: b.cookie },
    });
    expect(listaDeB.json<{ itens: unknown[] }>().itens).toHaveLength(0);

    const detalheDeB = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistema.id}`,
      headers: { cookie: b.cookie },
    });
    expect(detalheDeB.statusCode).toBe(404);

    const verificacaoDeB = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${sistema.id}/verificacao`,
      headers: { cookie: b.cookie },
      payload: {},
    });
    expect(verificacaoDeB.statusCode).toBe(404);
    expect(ambiente.filas.verificacoes).toHaveLength(0);

    const auditoriaDeB = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria',
      headers: { cookie: b.cookie },
    });
    const acoesDeB = auditoriaDeB.json<{ itens: { acao: string }[] }>().itens.map((i) => i.acao);
    expect(acoesDeB).not.toContain('SISTEMA_CADASTRADO');
  });
});

describe('verificação de propriedade', () => {
  it('registra o sucesso no agregado e na auditoria', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'v-ok');
    const sistema = await cadastrarSistema(cookie);

    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${sistema.id}/verificacao`,
      headers: { cookie },
      payload: {},
    });
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<{ verificado: boolean; expiraEm: string | null }>();
    expect(corpo.verificado).toBe(true);
    expect(corpo.expiraEm).not.toBeNull();

    expect(ambiente.filas.verificacoes[0]).toMatchObject({
      sistemaId: sistema.id,
      organizacaoId,
      metodo: 'ARQUIVO_WELL_KNOWN',
      token: sistema.verificacao.token,
    });

    const detalhe = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistema.id}`,
      headers: { cookie },
    });
    expect(detalhe.json()).toMatchObject({ verificacao: { estado: 'VERIFICADO' } });

    const auditoria = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria?acao=PROPRIEDADE_VERIFICADA',
      headers: { cookie },
    });
    expect(auditoria.json<{ itens: unknown[] }>().itens).toHaveLength(1);
  });

  it('registra a falha com a mensagem do worker', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'v-falha');
    const sistema = await cadastrarSistema(cookie);
    ambiente.filas.resultadoDaVerificacao = { verificado: false, mensagem: 'Arquivo não encontrado.' };

    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${sistema.id}/verificacao`,
      headers: { cookie },
      payload: {},
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      verificado: false,
      expiraEm: null,
      mensagem: 'Arquivo não encontrado.',
    });

    const detalhe = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistema.id}`,
      headers: { cookie },
    });
    expect(detalhe.json()).toMatchObject({
      verificacao: { estado: 'FALHOU', mensagem: 'Arquivo não encontrado.' },
    });

    const auditoria = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria?acao=VERIFICACAO_FALHOU',
      headers: { cookie },
    });
    expect(auditoria.json<{ itens: unknown[] }>().itens).toHaveLength(1);
  });

  it('responde 504 VERIFICACAO_DEMOROU quando a fila não responde a tempo', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'v-demora');
    const sistema = await cadastrarSistema(cookie);
    ambiente.filas.resultadoDaVerificacao = new ErroDeTempoEsgotadoDaFila();

    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${sistema.id}/verificacao`,
      headers: { cookie },
      payload: {},
    });
    expect(resposta.statusCode).toBe(504);
    expect(resposta.json<ErroJson>().erro).toMatchObject({
      codigo: 'VERIFICACAO_DEMOROU',
      mensagem:
        'A verificação demorou demais; confira se o worker está rodando e tente novamente.',
    });
  });
});
