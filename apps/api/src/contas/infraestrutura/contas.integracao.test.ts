import { criarEvento } from '@bastion/dominio-compartilhado';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emContextoDaOrganizacao } from '../../compartilhado/banco/conexao';
import { PublicadorDoOutbox, registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import { relogioDoSistema } from '../../compartilhado/relogio';
import {
  SENHA_DE_TESTE,
  cadastrarOrganizacaoDeTeste,
  corpoDeSistema,
  criarAmbienteDeTeste,
  type AmbienteDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';
import { assinarCorpo } from './assinatura-de-webhook';

let ambiente: AmbienteDeTeste;

beforeAll(async () => {
  ambiente = await criarAmbienteDeTeste();
});
beforeEach(async () => {
  await ambiente.limpar();
  ambiente.filas.entregas = [];
});
afterAll(async () => {
  await ambiente.encerrar();
});

interface ErroJson {
  erro: { codigo: string; mensagem: string; detalhes?: unknown };
}

describe('sessão e cadastro de organização', () => {
  it('cadastra a organização, abre a sessão e responde GET /v1/sessao', async () => {
    const { app } = ambiente;
    const cadastro = await app.inject({
      method: 'POST',
      url: '/v1/organizacoes',
      payload: {
        nomeDaOrganizacao: 'Acme',
        nome: 'Ana',
        email: 'Ana@Acme.com.br',
        senha: SENHA_DE_TESTE,
      },
    });
    expect(cadastro.statusCode).toBe(201);
    const cookie = cadastro.cookies.find((c) => c.name === 'bastion_sessao');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cadastro.body).not.toContain(cookie?.value ?? 'impossivel');

    const sessao = await app.inject({
      method: 'GET',
      url: '/v1/sessao',
      headers: { cookie: `bastion_sessao=${cookie?.value}` },
    });
    expect(sessao.statusCode).toBe(200);
    expect(sessao.json()).toMatchObject({
      usuario: { nome: 'Ana', email: 'ana@acme.com.br' },
      organizacao: { nome: 'Acme' },
      papel: 'DONO',
    });
  });

  it('recusa e-mail já cadastrado com 409', async () => {
    const { app } = ambiente;
    await cadastrarOrganizacaoDeTeste(app, 'a');
    const repetido = await app.inject({
      method: 'POST',
      url: '/v1/organizacoes',
      payload: {
        nomeDaOrganizacao: 'Outra',
        nome: 'Outro',
        email: 'dono-a@exemplo.com.br',
        senha: SENHA_DE_TESTE,
      },
    });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json<ErroJson>().erro.mensagem).toBe('Este e-mail já tem conta.');
  });

  it('valida o corpo com 400 VALIDACAO e detalhes por campo', async () => {
    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/organizacoes',
      payload: { nomeDaOrganizacao: '', nome: 'x', email: 'nao-e-email', senha: 'curta' },
    });
    expect(resposta.statusCode).toBe(400);
    const { erro } = resposta.json<ErroJson>();
    expect(erro.codigo).toBe('VALIDACAO');
    expect(Array.isArray(erro.detalhes)).toBe(true);
  });

  it('GET /v1/sessao sem credencial responde 401', async () => {
    const resposta = await ambiente.app.inject({ method: 'GET', url: '/v1/sessao' });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json<ErroJson>().erro).toMatchObject({
      codigo: 'NAO_AUTENTICADO',
      mensagem: 'Faça login para continuar.',
    });
  });

  it('login com senha errada devolve 401 genérico; com a senha certa devolve a sessão', async () => {
    const { app } = ambiente;
    const { email } = await cadastrarOrganizacaoDeTeste(app, 'login');
    const errado = await app.inject({
      method: 'POST',
      url: '/v1/sessao',
      payload: { email, senha: 'senha-errada' },
    });
    expect(errado.statusCode).toBe(401);
    expect(errado.json<ErroJson>().erro.mensagem).toBe('E-mail ou senha incorretos.');

    const inexistente = await app.inject({
      method: 'POST',
      url: '/v1/sessao',
      payload: { email: 'ninguem@exemplo.com.br', senha: SENHA_DE_TESTE },
    });
    expect(inexistente.statusCode).toBe(401);
    expect(inexistente.json<ErroJson>().erro.mensagem).toBe('E-mail ou senha incorretos.');

    const certo = await app.inject({
      method: 'POST',
      url: '/v1/sessao',
      payload: { email, senha: SENHA_DE_TESTE },
    });
    expect(certo.statusCode).toBe(200);
    expect(certo.json()).toMatchObject({ papel: 'DONO' });
    expect(certo.cookies.some((c) => c.name === 'bastion_sessao')).toBe(true);
  });

  it('DELETE /v1/sessao encerra a sessão', async () => {
    const { app } = ambiente;
    const { cookie } = await cadastrarOrganizacaoDeTeste(app, 'sair');
    const saida = await app.inject({ method: 'DELETE', url: '/v1/sessao', headers: { cookie } });
    expect(saida.statusCode).toBe(204);
    const depois = await app.inject({ method: 'GET', url: '/v1/sessao', headers: { cookie } });
    expect(depois.statusCode).toBe(401);
  });
});

describe('chaves de API e permissões', () => {
  const criarChave = async (cookie: string, papel: 'ANALISTA' | 'LEITOR') => {
    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/chaves-de-api',
      headers: { cookie },
      payload: { nome: `Chave ${papel}`, papel },
    });
    expect(resposta.statusCode).toBe(201);
    return resposta.json<{ chave: { id: string; prefixo: string }; segredo: string }>();
  };

  it('autentica por Bearer e recusa a chave depois de revogada', async () => {
    const { app } = ambiente;
    const { cookie } = await cadastrarOrganizacaoDeTeste(app, 'chaves');
    const { chave, segredo } = await criarChave(cookie, 'ANALISTA');
    expect(segredo).toMatch(/^bst_[0-9a-f]{8}_/);

    const comChave = await app.inject({
      method: 'GET',
      url: '/v1/sistemas',
      headers: { authorization: `Bearer ${segredo}` },
    });
    expect(comChave.statusCode).toBe(200);

    const listadas = await app.inject({ method: 'GET', url: '/v1/chaves-de-api', headers: { cookie } });
    const item = listadas
      .json<{ itens: { id: string; ultimoUsoEm: string | null; revogada: boolean }[] }>()
      .itens.find((i) => i.id === chave.id);
    expect(item?.ultimoUsoEm).not.toBeNull();

    const revogacao = await app.inject({
      method: 'DELETE',
      url: `/v1/chaves-de-api/${chave.id}`,
      headers: { cookie },
    });
    expect(revogacao.statusCode).toBe(204);

    const depois = await app.inject({
      method: 'GET',
      url: '/v1/sistemas',
      headers: { authorization: `Bearer ${segredo}` },
    });
    expect(depois.statusCode).toBe(401);

    const adulterada = await app.inject({
      method: 'GET',
      url: '/v1/sistemas',
      headers: { authorization: `Bearer ${segredo}x` },
    });
    expect(adulterada.statusCode).toBe(401);
  });

  it('LEITOR não cadastra sistema (403) mas consegue ler', async () => {
    const { app } = ambiente;
    const { cookie } = await cadastrarOrganizacaoDeTeste(app, 'leitor');
    const { segredo } = await criarChave(cookie, 'LEITOR');
    const cabecalhos = { authorization: `Bearer ${segredo}` };

    const cadastro = await app.inject({
      method: 'POST',
      url: '/v1/sistemas',
      headers: cabecalhos,
      payload: corpoDeSistema(),
    });
    expect(cadastro.statusCode).toBe(403);
    expect(cadastro.json<ErroJson>().erro.codigo).toBe('PERMISSAO_NEGADA');

    const leitura = await app.inject({ method: 'GET', url: '/v1/sistemas', headers: cabecalhos });
    expect(leitura.statusCode).toBe(200);
  });
});

describe('membros e convites', () => {
  it('convida, aceita o convite e passa a listar o membro como ATIVO', async () => {
    const { app } = ambiente;
    const { cookie } = await cadastrarOrganizacaoDeTeste(app, 'convite');

    const convite = await app.inject({
      method: 'POST',
      url: '/v1/membros',
      headers: { cookie },
      payload: { email: 'novo@exemplo.com.br', papel: 'LEITOR' },
    });
    expect(convite.statusCode).toBe(201);
    const { membro, tokenDoConvite } = convite.json<{
      membro: { id: string; estado: string };
      tokenDoConvite: string;
    }>();
    expect(membro.estado).toBe('CONVIDADO');

    const aceite = await app.inject({
      method: 'POST',
      url: '/v1/convites/aceitar',
      payload: { token: tokenDoConvite, nome: 'Novo Membro', senha: SENHA_DE_TESTE },
    });
    expect(aceite.statusCode).toBe(200);
    expect(aceite.json()).toMatchObject({ papel: 'LEITOR', usuario: { email: 'novo@exemplo.com.br' } });
    const sessaoNova = aceite.cookies.find((c) => c.name === 'bastion_sessao');
    expect(sessaoNova).toBeDefined();

    const lista = await app.inject({ method: 'GET', url: '/v1/membros', headers: { cookie } });
    const itens = lista.json<{ itens: { email: string; estado: string; papel: string }[] }>().itens;
    expect(itens.find((m) => m.email === 'novo@exemplo.com.br')).toMatchObject({
      estado: 'ATIVO',
      papel: 'LEITOR',
    });

    // O token só vale uma vez.
    const repetido = await app.inject({
      method: 'POST',
      url: '/v1/convites/aceitar',
      payload: { token: tokenDoConvite, nome: 'Novo Membro', senha: SENHA_DE_TESTE },
    });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json<ErroJson>().erro.codigo).toBe('CONVITE_INVALIDO');

    // O novo membro (LEITOR) não gerencia membros.
    const proibido = await app.inject({
      method: 'POST',
      url: '/v1/membros',
      headers: { cookie: `bastion_sessao=${sessaoNova?.value}` },
      payload: { email: 'outro@exemplo.com.br', papel: 'LEITOR' },
    });
    expect(proibido.statusCode).toBe(403);
  });
});

describe('auditoria', () => {
  it('registra as ações e lista com paginação por cursor', async () => {
    const { app } = ambiente;
    const { cookie } = await cadastrarOrganizacaoDeTeste(app, 'auditoria');
    for (const nome of ['A', 'B']) {
      await app.inject({
        method: 'POST',
        url: '/v1/chaves-de-api',
        headers: { cookie },
        payload: { nome: `Chave ${nome}`, papel: 'LEITOR' },
      });
    }

    const pagina1 = await app.inject({
      method: 'GET',
      url: '/v1/auditoria?limite=2',
      headers: { cookie },
    });
    expect(pagina1.statusCode).toBe(200);
    const corpo1 = pagina1.json<{ itens: { id: string; acao: string }[]; proximaPagina: string | null }>();
    expect(corpo1.itens).toHaveLength(2);
    expect(corpo1.proximaPagina).not.toBeNull();
    expect(corpo1.itens.every((i) => i.acao === 'CHAVE_DE_API_CRIADA')).toBe(true);

    const pagina2 = await app.inject({
      method: 'GET',
      url: `/v1/auditoria?limite=10&pagina=${corpo1.proximaPagina}`,
      headers: { cookie },
    });
    const corpo2 = pagina2.json<{ itens: { id: string; acao: string }[]; proximaPagina: string | null }>();
    expect(corpo2.proximaPagina).toBeNull();
    expect(corpo2.itens.map((i) => i.acao)).toEqual(
      expect.arrayContaining(['ORGANIZACAO_CRIADA', 'SESSAO_INICIADA']),
    );
    const idsDaPrimeira = new Set(corpo1.itens.map((i) => i.id));
    expect(corpo2.itens.some((i) => idsDaPrimeira.has(i.id))).toBe(false);

    const comCursorInvalido = await app.inject({
      method: 'GET',
      url: '/v1/auditoria?pagina=lixo',
      headers: { cookie },
    });
    expect(comCursorInvalido.statusCode).toBe(400);
  });

  it('o banco recusa UPDATE em registros_de_auditoria como bastion_app', async () => {
    const { app, db } = ambiente;
    const { organizacaoId } = await cadastrarOrganizacaoDeTeste(app, 'imutavel');
    await expect(
      emContextoDaOrganizacao(db, organizacaoId, (tx) =>
        tx.execute(sql`update registros_de_auditoria set alvo = 'adulterado'`),
      ),
    ).rejects.toThrow();
    await expect(
      emContextoDaOrganizacao(db, organizacaoId, (tx) =>
        tx.execute(sql`delete from registros_de_auditoria`),
      ),
    ).rejects.toThrow();
  });
});

describe('webhooks e outbox', () => {
  it('cadastra o webhook e entrega o evento assinado ao enfileirar', async () => {
    const { app, db, filas } = ambiente;
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(app, 'webhook');

    const sistema = await app.inject({
      method: 'POST',
      url: '/v1/sistemas',
      headers: { cookie },
      payload: corpoDeSistema(),
    });
    const { id: sistemaId } = sistema.json<{ id: string }>();

    const cadastro = await app.inject({
      method: 'POST',
      url: '/v1/webhooks',
      headers: { cookie },
      payload: { url: 'https://cliente.test/hook', eventos: ['avaliacao.concluida'] },
    });
    expect(cadastro.statusCode).toBe(201);
    const { webhook, segredoDeAssinatura } = cadastro.json<{
      webhook: { id: string };
      segredoDeAssinatura: string;
    }>();

    const naoHttps = await app.inject({
      method: 'POST',
      url: '/v1/webhooks',
      headers: { cookie },
      payload: { url: 'http://cliente.test/hook', eventos: ['avaliacao.concluida'] },
    });
    expect(naoHttps.statusCode).toBe(400);

    const evento = criarEvento(
      'AvaliacaoConcluida',
      organizacaoId,
      { avaliacaoId: crypto.randomUUID(), sistemaId, nota: 90, aprovada: true },
      new Date(),
    );
    await emContextoDaOrganizacao(db, organizacaoId, (tx) => registrarNoOutbox(tx, [evento]));

    const publicador = new PublicadorDoOutbox(db, relogioDoSistema);
    await publicador.publicarPendentes();

    expect(filas.entregas).toHaveLength(1);
    const entrega = filas.entregas[0];
    expect(entrega?.url).toBe('https://cliente.test/hook');
    expect(entrega?.assinatura).toBe(assinarCorpo(segredoDeAssinatura, entrega?.corpo ?? ''));
    expect(JSON.parse(entrega?.corpo ?? '{}')).toMatchObject({
      id: evento.id,
      tipo: 'avaliacao.concluida',
      organizacaoId,
    });

    // Já publicado: uma nova rodada não repete a entrega.
    await publicador.publicarPendentes();
    expect(filas.entregas).toHaveLength(1);

    const desativar = await app.inject({
      method: 'PATCH',
      url: `/v1/webhooks/${webhook.id}`,
      headers: { cookie },
      payload: { ativo: false },
    });
    expect(desativar.statusCode).toBe(200);
    expect(desativar.json()).toMatchObject({ ativo: false });
  });
});
