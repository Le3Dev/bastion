import { randomUUID } from 'node:crypto';
import type { AvaliacaoDto, PainelDto, RequisicaoDoGuardiaoDto } from '@bastion/contratos';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PublicadorDoOutbox } from '../../compartilhado/outbox/outbox';
import { relogioDoSistema } from '../../compartilhado/relogio';
import {
  cadastrarOrganizacaoDeTeste,
  corpoDeSistema,
  criarAmbienteDeTeste,
  type AmbienteDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';
import { processarResultado } from '../../integracoes/consumidor-de-resultados';

let ambiente: AmbienteDeTeste;

beforeAll(async () => {
  ambiente = await criarAmbienteDeTeste();
});
beforeEach(async () => {
  await ambiente.limpar();
  ambiente.filas.avaliacoes = [];
  ambiente.filas.vigilancias = [];
  ambiente.filas.cancelamentos = [];
  ambiente.filas.erroAoEnfileirarAvaliacao = null;
  ambiente.filas.resultadoDaVerificacao = { verificado: true, mensagem: 'ok' };
});
afterAll(async () => {
  await ambiente.encerrar();
});

interface ErroJson {
  erro: { codigo: string; mensagem: string };
}

const cadastrarSistema = async (cookie: string): Promise<string> => {
  const resposta = await ambiente.app.inject({
    method: 'POST',
    url: '/v1/sistemas',
    headers: { cookie },
    payload: corpoDeSistema(),
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<{ id: string }>().id;
};

const verificarSistema = async (cookie: string, sistemaId: string): Promise<void> => {
  const resposta = await ambiente.app.inject({
    method: 'POST',
    url: `/v1/sistemas/${sistemaId}/verificacao`,
    headers: { cookie },
    payload: {},
  });
  expect(resposta.statusCode).toBe(200);
  expect(resposta.json<{ verificado: boolean }>().verificado).toBe(true);
};

const solicitar = async (cookie: string, sistemaId: string, extras: Record<string, unknown> = {}) =>
  ambiente.app.inject({
    method: 'POST',
    url: '/v1/avaliacoes',
    headers: { cookie },
    payload: { sistemaId, ...extras },
  });

const obterAvaliacao = async (cookie: string, id: string): Promise<AvaliacaoDto> => {
  const resposta = await ambiente.app.inject({
    method: 'GET',
    url: `/v1/avaliacoes/${id}`,
    headers: { cookie },
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<AvaliacaoDto>();
};

const evento = (
  organizacaoId: string,
  avaliacaoId: string,
  resto: Record<string, unknown>,
): Record<string, unknown> => ({
  idDoEvento: randomUUID(),
  organizacaoId,
  avaliacaoId,
  em: new Date().toISOString(),
  ...resto,
});

const constatacao = (tipo: 'CABECALHO_HSTS_AUSENTE' | 'CABECALHO_CSP_AUSENTE', severidade: 'ALTA' | 'MEDIA') => ({
  tipo,
  titulo: `Constatação ${tipo}`,
  severidade,
  local: 'https://homologacao.cliente.test/',
  descricao: 'Cabeçalho de segurança ausente na resposta.',
  evidencia: { requisicao: 'GET /', resposta: 'HTTP/1.1 200', observacao: 'Cabeçalho não enviado' },
  correcaoSugerida: 'Envie o cabeçalho recomendado.',
  conformidade: { owasp: ['A05:2021'], lgpd: [] },
});

describe('solicitação de avaliações', () => {
  it('sistema verificado: responde 202, fica NA_FILA e enfileira a tarefa com o escopo do sistema', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av1');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);

    const resposta = await solicitar(cookie, sistemaId);
    expect(resposta.statusCode).toBe(202);
    const corpo = resposta.json<{ id: string; estado: string }>();
    expect(corpo.estado).toBe('NA_FILA');

    expect(ambiente.filas.avaliacoes).toHaveLength(1);
    expect(ambiente.filas.avaliacoes[0]).toMatchObject({
      avaliacaoId: corpo.id,
      organizacaoId,
      sistemaId,
      perfil: 'PASSIVO',
      urlDeHomologacao: 'https://homologacao.cliente.test',
      escopo: {
        hostsPermitidos: ['homologacao.cliente.test'],
        dominiosBloqueados: ['producao.cliente.test'],
        tempoMaximoMs: 10 * 60_000,
      },
    });
    const prazos = ambiente.filas.vigilancias.map((v) => v.atrasoMs).sort((a, b) => a - b);
    expect(prazos).toEqual([20 * 60_000, 11 * 60_000].sort((a, b) => a - b));
    expect(ambiente.filas.vigilancias.every((v) => v.tarefa.tipo === 'tempo-limite-da-avaliacao')).toBe(true);

    const dto = await obterAvaliacao(cookie, corpo.id);
    expect(dto).toMatchObject({
      estado: 'NA_FILA',
      origem: 'WEB',
      notaMinima: 70,
      sistemaNome: 'Portal de homologação',
      nota: null,
      relatorioId: null,
    });
    expect(dto.etapas).toHaveLength(6);
  });

  it('sistema não verificado: fica AGUARDANDO_VERIFICACAO sem enfileirar; ao verificar, o outbox o libera', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av2');
    const sistemaId = await cadastrarSistema(cookie);

    const resposta = await solicitar(cookie, sistemaId, { notaMinima: 80 });
    expect(resposta.statusCode).toBe(202);
    const { id, estado } = resposta.json<{ id: string; estado: string }>();
    expect(estado).toBe('AGUARDANDO_VERIFICACAO');
    expect(ambiente.filas.avaliacoes).toHaveLength(0);

    await verificarSistema(cookie, sistemaId);
    const publicador = new PublicadorDoOutbox(ambiente.db, relogioDoSistema);
    await publicador.publicarPendentes();

    expect((await obterAvaliacao(cookie, id)).estado).toBe('NA_FILA');
    expect(ambiente.filas.avaliacoes.map((t) => t.avaliacaoId)).toEqual([id]);
  });

  it('fila indisponível: marca FALHOU e responde 503', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av3');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    ambiente.filas.erroAoEnfileirarAvaliacao = new Error('redis fora do ar');

    const resposta = await solicitar(cookie, sistemaId);
    expect(resposta.statusCode).toBe(503);
    expect(resposta.json<ErroJson>().erro.mensagem).toBe('Fila indisponível; tente novamente.');

    const lista = await ambiente.app.inject({ method: 'GET', url: '/v1/avaliacoes', headers: { cookie } });
    const itens = lista.json<{ itens: AvaliacaoDto[] }>().itens;
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      estado: 'FALHOU',
      motivoDaFalha: 'Fila indisponível; tente novamente.',
    });
  });

  it('rejeita perfil ainda indisponível com 422', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av4');
    const sistemaId = await cadastrarSistema(cookie);
    const resposta = await solicitar(cookie, sistemaId, { perfil: 'COMPLETO' });
    expect(resposta.statusCode).toBe(422);
  });

  it('lista com filtro por estado e paginação por cursor', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av5');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    for (let i = 0; i < 3; i++) expect((await solicitar(cookie, sistemaId)).statusCode).toBe(202);

    const primeira = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/avaliacoes?limite=2',
      headers: { cookie },
    });
    const pagina1 = primeira.json<{ itens: AvaliacaoDto[]; proximaPagina: string | null }>();
    expect(pagina1.itens).toHaveLength(2);
    expect(pagina1.proximaPagina).not.toBeNull();

    const segunda = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/avaliacoes?limite=2&pagina=${pagina1.proximaPagina}`,
      headers: { cookie },
    });
    const pagina2 = segunda.json<{ itens: AvaliacaoDto[]; proximaPagina: string | null }>();
    expect(pagina2.itens).toHaveLength(1);
    expect(pagina2.proximaPagina).toBeNull();
    const ids = [...pagina1.itens, ...pagina2.itens].map((a) => a.id);
    expect(new Set(ids).size).toBe(3);

    const filtrada = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/avaliacoes?estado=CONCLUIDA',
      headers: { cookie },
    });
    expect(filtrada.json<{ itens: unknown[] }>().itens).toHaveLength(0);
  });
});

describe('processamento dos eventos do worker', () => {
  it('a sequência completa leva a CONCLUIDA com nota, relatório e última nota do sistema', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av6');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    const { id } = (await solicitar(cookie, sistemaId)).json<{ id: string }>();
    const enviar = (resto: Record<string, unknown>) =>
      processarResultado(ambiente.db, evento(organizacaoId, id, resto));

    expect(await enviar({ tipo: 'preparacao-iniciada' })).toBe('processado');
    expect((await obterAvaliacao(cookie, id)).estado).toBe('PREPARANDO');
    await enviar({ tipo: 'execucao-iniciada' });
    expect((await obterAvaliacao(cookie, id)).estado).toBe('EM_EXECUCAO');

    await enviar({
      tipo: 'requisicao-do-guardiao',
      metodo: 'GET',
      url: 'https://homologacao.cliente.test/',
      decisao: 'PERMITIDA',
      motivo: 'Dentro do escopo',
      status: 200,
    });
    await enviar({
      tipo: 'requisicao-do-guardiao',
      metodo: 'GET',
      url: 'https://producao.cliente.test/',
      decisao: 'BLOQUEADA',
      motivo: 'Domínio de produção',
      status: null,
    });
    await enviar({
      tipo: 'etapa-atualizada',
      nome: 'Cabeçalhos de segurança',
      estado: 'CONCLUIDA',
      progresso: 100,
    });
    await enviar({ tipo: 'constatacao', constatacao: constatacao('CABECALHO_HSTS_AUSENTE', 'ALTA') });
    await enviar({ tipo: 'constatacao', constatacao: constatacao('CABECALHO_CSP_AUSENTE', 'MEDIA') });

    const emExecucao = await obterAvaliacao(cookie, id);
    expect(emExecucao.etapas.find((e) => e.nome === 'Cabeçalhos de segurança')?.estado).toBe('CONCLUIDA');
    expect(emExecucao.contagemDeAchados).toMatchObject({ ALTA: 1, MEDIA: 1 });

    await enviar({ tipo: 'analise-iniciada' });
    expect((await obterAvaliacao(cookie, id)).estado).toBe('ANALISANDO');
    const finalizacao = evento(organizacaoId, id, { tipo: 'avaliacao-finalizada' });
    expect(await processarResultado(ambiente.db, finalizacao)).toBe('processado');
    // O mesmo evento repetido (reentrega do BullMQ) é ignorado.
    expect(await processarResultado(ambiente.db, finalizacao)).toBe('duplicado');

    const concluida = await obterAvaliacao(cookie, id);
    expect(concluida.estado).toBe('CONCLUIDA');
    expect(concluida.nota).not.toBeNull();
    expect(concluida.progresso).toBe(100);
    expect(concluida.relatorioId).not.toBeNull();
    expect(concluida.concluidaEm).not.toBeNull();

    const sistema = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistemaId}`,
      headers: { cookie },
    });
    expect(sistema.json<{ ultimaNota: number | null }>().ultimaNota).toBe(concluida.nota);

    const requisicoes = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/avaliacoes/${id}/requisicoes`,
      headers: { cookie },
    });
    const itens = requisicoes.json<{ itens: RequisicaoDoGuardiaoDto[] }>().itens;
    expect(itens.map((r) => r.decisao)).toEqual(['PERMITIDA', 'BLOQUEADA']);

    const auditoria = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria?limite=50',
      headers: { cookie },
    });
    const acoes = auditoria.json<{ itens: { acao: string }[] }>().itens.map((i) => i.acao);
    expect(acoes).toEqual(
      expect.arrayContaining([
        'AVALIACAO_SOLICITADA',
        'AVALIACAO_CONCLUIDA',
        'REQUISICAO_BLOQUEADA_PELO_GUARDIAO',
      ]),
    );

    // O ao vivo recebeu avaliação, requisição e achado.
    const tipos = new Set(ambiente.aoVivo.publicados.map((p) => p.evento.tipo));
    expect(tipos).toEqual(new Set(['avaliacao', 'requisicao', 'achado']));
  });

  it('falha informada pelo worker leva a FALHOU; eventos seguintes são ignorados sem erro', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av7');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    const { id } = (await solicitar(cookie, sistemaId)).json<{ id: string }>();

    await processarResultado(ambiente.db, evento(organizacaoId, id, { tipo: 'preparacao-iniciada' }));
    await processarResultado(
      ambiente.db,
      evento(organizacaoId, id, { tipo: 'avaliacao-falhou', motivo: 'Alvo fora do ar' }),
    );
    const falhou = await obterAvaliacao(cookie, id);
    expect(falhou).toMatchObject({ estado: 'FALHOU', motivoDaFalha: 'Alvo fora do ar' });

    await expect(
      processarResultado(ambiente.db, evento(organizacaoId, id, { tipo: 'execucao-iniciada' })),
    ).resolves.toBe('processado');
    expect((await obterAvaliacao(cookie, id)).estado).toBe('FALHOU');
  });

  it('transição inválida (finalizada sem análise) é ignorada sem lançar erro', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av8');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    const { id } = (await solicitar(cookie, sistemaId)).json<{ id: string }>();

    await expect(
      processarResultado(ambiente.db, evento(organizacaoId, id, { tipo: 'avaliacao-finalizada' })),
    ).resolves.toBe('processado');
    expect((await obterAvaliacao(cookie, id)).estado).toBe('NA_FILA');
  });
});

describe('parar avaliação', () => {
  it('cancela, sinaliza o worker, e os eventos posteriores são ignorados', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av9');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    const { id } = (await solicitar(cookie, sistemaId)).json<{ id: string }>();

    const parada = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/avaliacoes/${id}/parar`,
      headers: { cookie },
    });
    expect(parada.statusCode).toBe(200);
    expect(parada.json()).toEqual({ estado: 'CANCELADA' });
    expect(ambiente.filas.cancelamentos).toEqual([id]);
    expect((await obterAvaliacao(cookie, id)).estado).toBe('CANCELADA');

    await expect(
      processarResultado(ambiente.db, evento(organizacaoId, id, { tipo: 'preparacao-iniciada' })),
    ).resolves.toBe('processado');
    await expect(
      processarResultado(
        ambiente.db,
        evento(organizacaoId, id, { tipo: 'constatacao', constatacao: constatacao('CABECALHO_CSP_AUSENTE', 'MEDIA') }),
      ),
    ).resolves.toBe('processado');
    const depois = await obterAvaliacao(cookie, id);
    expect(depois.estado).toBe('CANCELADA');
    expect(depois.contagemDeAchados).toMatchObject({ CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 });

    const outra = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/avaliacoes/${id}/parar`,
      headers: { cookie },
    });
    expect(outra.statusCode).toBe(422);
  });
});

describe('acompanhamento ao vivo (SSE)', () => {
  it('envia o estado atual e encerra o stream quando a avaliação já está em estado final', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av10');
    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    const { id } = (await solicitar(cookie, sistemaId)).json<{ id: string }>();
    await ambiente.app.inject({ method: 'POST', url: `/v1/avaliacoes/${id}/parar`, headers: { cookie } });

    const resposta = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/avaliacoes/${id}/eventos`,
      headers: { cookie },
    });
    expect(resposta.statusCode).toBe(200);
    expect(String(resposta.headers['content-type'])).toContain('text/event-stream');
    expect(resposta.headers['cache-control']).toBe('no-cache');
    expect(resposta.body).toContain('event: avaliacao');
    expect(resposta.body).toContain('"estado":"CANCELADA"');
  });

  it('exige autenticação e existência antes de abrir o stream', async () => {
    const semLogin = await ambiente.app.inject({ method: 'GET', url: `/v1/avaliacoes/${randomUUID()}/eventos` });
    expect(semLogin.statusCode).toBe(401);

    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'av11');
    const inexistente = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/avaliacoes/${randomUUID()}/eventos`,
      headers: { cookie },
    });
    expect(inexistente.statusCode).toBe(404);
  });
});

describe('isolamento entre organizações', () => {
  it('outra organização recebe 404 ao consultar, parar, acompanhar ou avaliar o sistema', async () => {
    const a = await cadastrarOrganizacaoDeTeste(ambiente.app, 'iso-a');
    const b = await cadastrarOrganizacaoDeTeste(ambiente.app, 'iso-b');
    const sistemaId = await cadastrarSistema(a.cookie);
    await verificarSistema(a.cookie, sistemaId);
    const { id } = (await solicitar(a.cookie, sistemaId)).json<{ id: string }>();

    for (const [metodo, url] of [
      ['GET', `/v1/avaliacoes/${id}`],
      ['GET', `/v1/avaliacoes/${id}/requisicoes`],
      ['GET', `/v1/avaliacoes/${id}/eventos`],
      ['POST', `/v1/avaliacoes/${id}/parar`],
    ] as const) {
      const resposta = await ambiente.app.inject({ method: metodo, url, headers: { cookie: b.cookie } });
      expect(resposta.statusCode, `${metodo} ${url}`).toBe(404);
    }
    expect((await solicitar(b.cookie, sistemaId)).statusCode).toBe(404);

    const lista = await ambiente.app.inject({ method: 'GET', url: '/v1/avaliacoes', headers: { cookie: b.cookie } });
    expect(lista.json<{ itens: unknown[] }>().itens).toEqual([]);
  });
});

describe('painel', () => {
  it('responde no formato do contrato, vazio e depois de uma avaliação concluída', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'pn');
    const vazio = await ambiente.app.inject({ method: 'GET', url: '/v1/painel', headers: { cookie } });
    expect(vazio.statusCode).toBe(200);
    expect(vazio.json<PainelDto>()).toEqual({
      notaMedia: null,
      achadosEmAbertoPorSeveridade: { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 },
      sistemas: { verificados: 0, pendentes: 0 },
      avaliacoesEmAndamento: 0,
      avaliacoesRecentes: [],
      achadosCriticosEAltos: [],
    });

    const sistemaId = await cadastrarSistema(cookie);
    await verificarSistema(cookie, sistemaId);
    const { id } = (await solicitar(cookie, sistemaId)).json<{ id: string }>();
    const emAndamento = await ambiente.app.inject({ method: 'GET', url: '/v1/painel', headers: { cookie } });
    expect(emAndamento.json<PainelDto>()).toMatchObject({
      sistemas: { verificados: 1, pendentes: 0 },
      avaliacoesEmAndamento: 1,
    });

    for (const resto of [
      { tipo: 'preparacao-iniciada' },
      { tipo: 'execucao-iniciada' },
      { tipo: 'constatacao', constatacao: constatacao('CABECALHO_HSTS_AUSENTE', 'ALTA') },
      { tipo: 'analise-iniciada' },
      { tipo: 'avaliacao-finalizada' },
    ]) {
      await processarResultado(ambiente.db, evento(organizacaoId, id, resto));
    }

    const painel = (
      await ambiente.app.inject({ method: 'GET', url: '/v1/painel', headers: { cookie } })
    ).json<PainelDto>();
    const concluida = await obterAvaliacao(cookie, id);
    expect(painel.notaMedia).toBe(concluida.nota);
    expect(painel.avaliacoesEmAndamento).toBe(0);
    expect(painel.avaliacoesRecentes.map((a) => a.id)).toEqual([id]);
    expect(painel.achadosEmAbertoPorSeveridade.ALTA).toBe(1);
    expect(painel.achadosCriticosEAltos).toHaveLength(1);
  });
});
