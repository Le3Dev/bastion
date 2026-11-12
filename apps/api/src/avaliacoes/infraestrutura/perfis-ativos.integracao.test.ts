import type { SistemaDto } from '@bastion/contratos';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cadastrarOrganizacaoDeTeste,
  corpoDeSistema,
  criarAmbienteDeTeste,
  type AmbienteDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';

let ambiente: AmbienteDeTeste;
let cookie: string;

beforeAll(async () => {
  ambiente = await criarAmbienteDeTeste();
});
beforeEach(async () => {
  await ambiente.limpar();
  ambiente.filas.avaliacoes = [];
  ambiente.filas.resultadoDaVerificacao = { verificado: true, mensagem: 'ok' };
  cookie = (await cadastrarOrganizacaoDeTeste(ambiente.app, 'ativos')).cookie;
});
afterAll(async () => {
  await ambiente.encerrar();
});

interface ErroJson {
  erro: { codigo: string; mensagem: string };
}

const AUTORIZACAO = { responsavel: 'Maria da Segurança', referencia: 'Termo de autorização 2026/14' };
const PEDIDO_AUTORIZACAO = { ...AUTORIZACAO, aceito: true as const };
const CREDENCIAL = {
  modo: 'FORMULARIO',
  urlDeLogin: 'https://homologacao.cliente.test/login',
  campoUsuario: 'email',
  campoSenha: 'senha',
  usuario: 'usuario-de-teste@cliente.test',
  senha: 'S3nha-Super-Secreta',
  indicadorDeSucesso: 'Sair',
};
const CONECTOR = {
  url: 'https://homologacao.cliente.test/api/chat',
  cabecalhos: { Authorization: 'Bearer token-do-conector' },
  modeloDoCorpo: '{"mensagem":"{{mensagem}}"}',
  caminhoDaResposta: 'resposta.texto',
  frasesSigilosas: ['instrução interna'],
};

const cadastrarSistema = async (tipo: 'SITE' | 'APP_COM_IA' = 'SITE'): Promise<string> => {
  const cadastro = await ambiente.app.inject({
    method: 'POST',
    url: '/v1/sistemas',
    headers: { cookie },
    payload: { ...corpoDeSistema(), tipo },
  });
  expect(cadastro.statusCode).toBe(201);
  const id = cadastro.json<{ id: string }>().id;
  const verificacao = await ambiente.app.inject({
    method: 'POST',
    url: `/v1/sistemas/${id}/verificacao`,
    headers: { cookie },
    payload: {},
  });
  expect(verificacao.json<{ verificado: boolean }>().verificado).toBe(true);
  return id;
};

const configurar = (sistemaId: string, caminho: string, payload: object, method: 'PUT' | 'PATCH' = 'PUT') =>
  ambiente.app.inject({ method, url: `/v1/sistemas/${sistemaId}/${caminho}`, headers: { cookie }, payload });

const solicitar = (sistemaId: string, extras: Record<string, unknown>) =>
  ambiente.app.inject({
    method: 'POST',
    url: '/v1/avaliacoes',
    headers: { cookie },
    payload: { sistemaId, ...extras },
  });

describe('perfis ativos: autorização e escopo da tarefa', () => {
  it('exige autorização por escrito no perfil PADRAO', async () => {
    const sistemaId = await cadastrarSistema();
    const sem = await solicitar(sistemaId, { perfil: 'PADRAO' });
    expect(sem.statusCode).toBe(422);
    expect(sem.json<ErroJson>().erro.codigo).toBe('AUTORIZACAO_OBRIGATORIA');
    expect(ambiente.filas.avaliacoes).toHaveLength(0);

    const com = await solicitar(sistemaId, { perfil: 'PADRAO', autorizacao: PEDIDO_AUTORIZACAO });
    expect(com.statusCode).toBe(202);
    const [tarefa] = ambiente.filas.avaliacoes;
    expect(tarefa?.escopo.metodosPermitidos).toEqual(['GET', 'HEAD', 'OPTIONS']);
    expect(tarefa?.escopo.tetoDeRequisicoes).toBe(500);
    expect(tarefa?.escopo.permitirCriacaoDeDados).toBe(false);
    expect(tarefa?.credencialDeTeste).toBeUndefined();

    const id = com.json<{ id: string }>().id;
    const dto = await ambiente.app.inject({ method: 'GET', url: `/v1/avaliacoes/${id}`, headers: { cookie } });
    expect(dto.json<{ autorizacao: unknown }>().autorizacao).toEqual(AUTORIZACAO);
  });

  it('criação de dados só vale no COMPLETO e com o consentimento do sistema', async () => {
    const sistemaId = await cadastrarSistema();
    const semConsentimento = await solicitar(sistemaId, {
      perfil: 'COMPLETO',
      autorizacao: PEDIDO_AUTORIZACAO,
      permitirCriacaoDeDados: true,
    });
    expect(semConsentimento.statusCode).toBe(422);
    expect(semConsentimento.json<ErroJson>().erro.codigo).toBe('CONSENTIMENTO_AUSENTE');

    expect((await configurar(sistemaId, 'consentimento-de-dados', { permitir: true }, 'PATCH')).statusCode).toBe(200);
    const aceita = await solicitar(sistemaId, {
      perfil: 'COMPLETO',
      autorizacao: PEDIDO_AUTORIZACAO,
      permitirCriacaoDeDados: true,
    });
    expect(aceita.statusCode).toBe(202);
    const padrao = await solicitar(sistemaId, {
      perfil: 'PADRAO',
      autorizacao: PEDIDO_AUTORIZACAO,
      permitirCriacaoDeDados: true,
    });
    expect(padrao.statusCode).toBe(202);
    const [completo, simples] = ambiente.filas.avaliacoes;
    expect(completo?.escopo.permitirCriacaoDeDados).toBe(true);
    expect(completo?.escopo.metodosPermitidos).toContain('POST');
    expect(simples?.escopo.permitirCriacaoDeDados).toBe(false);
  });
});

describe('credencial de teste', () => {
  it('não vaza usuário/senha no DTO e chega decifrada ao worker no COMPLETO', async () => {
    const sistemaId = await cadastrarSistema();
    const resposta = await configurar(sistemaId, 'credencial-de-teste', CREDENCIAL);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<SistemaDto>().credencialDeTeste).toEqual({
      configurada: true,
      modo: 'FORMULARIO',
      urlDeLogin: CREDENCIAL.urlDeLogin,
      indicadorDeSucesso: 'Sair',
    });
    const lido = await ambiente.app.inject({ method: 'GET', url: `/v1/sistemas/${sistemaId}`, headers: { cookie } });
    expect(lido.body).not.toContain(CREDENCIAL.senha);
    expect(lido.body).not.toContain(CREDENCIAL.usuario);

    const completo = await solicitar(sistemaId, { perfil: 'COMPLETO', autorizacao: PEDIDO_AUTORIZACAO });
    expect(completo.statusCode).toBe(202);
    expect(ambiente.filas.avaliacoes[0]?.credencialDeTeste).toMatchObject({
      usuario: CREDENCIAL.usuario,
      senha: CREDENCIAL.senha,
      campoUsuario: 'email',
    });

    const remocao = await ambiente.app.inject({
      method: 'DELETE',
      url: `/v1/sistemas/${sistemaId}/credencial-de-teste`,
      headers: { cookie },
    });
    expect(remocao.json<SistemaDto>().credencialDeTeste.configurada).toBe(false);
    await solicitar(sistemaId, { perfil: 'COMPLETO', autorizacao: PEDIDO_AUTORIZACAO });
    expect(ambiente.filas.avaliacoes[1]?.credencialDeTeste).toBeUndefined();
  });
});

describe('conector de IA', () => {
  it('rejeita o perfil IA em sistema que não é app com IA e em sistema sem conector', async () => {
    const site = await cadastrarSistema('SITE');
    const emSite = await solicitar(site, { perfil: 'IA', autorizacao: PEDIDO_AUTORIZACAO });
    expect(emSite.statusCode).toBe(422);
    expect(emSite.json<ErroJson>().erro.codigo).toBe('PERFIL_INDISPONIVEL');
    expect((await configurar(site, 'conector-de-ia', CONECTOR)).statusCode).toBe(422);

    const app = await cadastrarSistema('APP_COM_IA');
    const semConector = await solicitar(app, { perfil: 'IA', autorizacao: PEDIDO_AUTORIZACAO });
    expect(semConector.statusCode).toBe(422);
    expect(semConector.json<ErroJson>().erro.codigo).toBe('PERFIL_INDISPONIVEL');
    expect(ambiente.filas.avaliacoes).toHaveLength(0);
  });

  it('envia o conector decifrado ao worker sem expor cabeçalhos no DTO', async () => {
    const sistemaId = await cadastrarSistema('APP_COM_IA');
    const resposta = await configurar(sistemaId, 'conector-de-ia', CONECTOR);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<SistemaDto>().conectorDeIa).toEqual({
      configurado: true,
      url: CONECTOR.url,
      caminhoDaResposta: 'resposta.texto',
    });
    expect(resposta.body).not.toContain('token-do-conector');

    const ia = await solicitar(sistemaId, { perfil: 'IA', autorizacao: PEDIDO_AUTORIZACAO });
    expect(ia.statusCode).toBe(202);
    const [tarefa] = ambiente.filas.avaliacoes;
    expect(tarefa?.escopo.tetoDeRequisicoes).toBe(100);
    expect(tarefa?.conectorDeIa).toEqual({
      url: CONECTOR.url,
      cabecalhos: CONECTOR.cabecalhos,
      modeloDoCorpo: CONECTOR.modeloDoCorpo,
      caminhoDaResposta: 'resposta.texto',
      frasesSigilosas: ['instrução interna'],
    });
    expect(tarefa?.credencialDeTeste).toBeUndefined();
  });
});
