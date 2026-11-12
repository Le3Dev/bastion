import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  ambiente.filas.agendamentos.clear();
  ambiente.filas.avaliacoes = [];
  ambiente.filas.resultadoDaVerificacao = { verificado: true, mensagem: 'ok' };
});
afterAll(async () => {
  await ambiente.encerrar();
});

interface ErroJson {
  erro: { codigo: string; mensagem: string };
}

const cadastrarSistema = async (cookie: string, indice = 0, verificar = true): Promise<string> => {
  const resposta = await ambiente.app.inject({
    method: 'POST',
    url: '/v1/sistemas',
    headers: { cookie },
    payload: corpoDeSistema({ nome: `Sistema ${indice}` }),
  });
  expect(resposta.statusCode).toBe(201);
  const { id } = resposta.json<{ id: string }>();
  if (verificar) {
    const verificacao = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${id}/verificacao`,
      headers: { cookie },
      payload: {},
    });
    expect(verificacao.statusCode).toBe(200);
  }
  return id;
};

const criarAgendamento = (cookie: string, payload: Record<string, unknown>) =>
  ambiente.app.inject({ method: 'POST', url: '/v1/agendamentos', headers: { cookie }, payload });

describe('limites do plano', () => {
  it('recusa o 11º sistema ativo com 422 LIMITE_DO_PLANO; arquivar libera a vaga', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'limite-sis');
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) ids.push(await cadastrarSistema(cookie, i, false));

    const recusado = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/sistemas',
      headers: { cookie },
      payload: corpoDeSistema({ nome: 'Excedente' }),
    });
    expect(recusado.statusCode).toBe(422);
    expect(recusado.json<ErroJson>().erro.codigo).toBe('LIMITE_DO_PLANO');

    const arquivar = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${ids[0]}/arquivar`,
      headers: { cookie },
    });
    expect(arquivar.statusCode).toBe(200);

    const plano = await ambiente.app.inject({ method: 'GET', url: '/v1/plano', headers: { cookie } });
    expect(plano.json()).toMatchObject({ uso: { sistemas: 9 } });
    await cadastrarSistema(cookie, 99, false);
  });

  it('recusa a 101ª avaliação do mês e o agendamento que estoura é pulado e auditado', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'limite-ava');
    const sistemaId = await cadastrarSistema(cookie);
    const agendamento = await criarAgendamento(cookie, {
      sistemaId,
      perfil: 'PASSIVO',
      frequencia: 'DIARIA',
      horario: '03:00',
    });
    expect(agendamento.statusCode).toBe(201);
    const { id: agendamentoId } = agendamento.json<{ id: string }>();

    // Antes do limite, o disparo cria uma avaliação com origem AGENDA e a enfileira.
    expect(await ambiente.app.servicos.agendamentos.disparar(organizacaoId, agendamentoId)).toBe(
      'AVALIACAO_CRIADA',
    );
    expect(ambiente.filas.avaliacoes).toHaveLength(1);
    const lista = await ambiente.app.inject({ method: 'GET', url: '/v1/avaliacoes', headers: { cookie } });
    expect(lista.json<{ itens: { origem: string }[] }>().itens[0]?.origem).toBe('AGENDA');

    for (let i = 1; i < 100; i += 1) {
      const resposta = await ambiente.app.inject({
        method: 'POST',
        url: '/v1/avaliacoes',
        headers: { cookie },
        payload: { sistemaId, perfil: 'PASSIVO' },
      });
      expect(resposta.statusCode).toBe(202);
    }
    const excedente = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/avaliacoes',
      headers: { cookie },
      payload: { sistemaId, perfil: 'PASSIVO' },
    });
    expect(excedente.statusCode).toBe(422);
    expect(excedente.json<ErroJson>().erro.codigo).toBe('LIMITE_DO_PLANO');

    const antes = ambiente.filas.avaliacoes.length;
    expect(await ambiente.app.servicos.agendamentos.disparar(organizacaoId, agendamentoId)).toBe(
      'PULADO_POR_LIMITE',
    );
    expect(ambiente.filas.avaliacoes).toHaveLength(antes);
    const auditoria = await ambiente.app.inject({ method: 'GET', url: '/v1/auditoria', headers: { cookie } });
    const acoes = auditoria.json<{ itens: { acao: string }[] }>().itens.map((item) => item.acao);
    expect(acoes).toContain('AGENDAMENTO_PULADO_POR_LIMITE');
  }, 60_000);
});

describe('arquivar sistema e trocar método', () => {
  it('arquivar esconde da listagem, bloqueia avaliação e pausa os agendamentos', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'arquivar');
    const sistemaId = await cadastrarSistema(cookie);
    const agendamento = await criarAgendamento(cookie, {
      sistemaId,
      frequencia: 'SEMANAL',
      diaDaSemana: 1,
      horario: '22:30',
    });
    const { id: agendamentoId } = agendamento.json<{ id: string }>();
    expect(ambiente.filas.agendamentos.has(agendamentoId)).toBe(true);

    const arquivado = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/sistemas/${sistemaId}/arquivar`,
      headers: { cookie },
    });
    expect(arquivado.statusCode).toBe(200);
    expect(arquivado.json()).toMatchObject({ id: sistemaId, arquivado: true });
    expect(ambiente.filas.agendamentos.has(agendamentoId)).toBe(false);

    const padrao = await ambiente.app.inject({ method: 'GET', url: '/v1/sistemas', headers: { cookie } });
    expect(padrao.json<{ itens: unknown[] }>().itens).toHaveLength(0);
    const completa = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/sistemas?incluirArquivados=true',
      headers: { cookie },
    });
    expect(completa.json<{ itens: { id: string; arquivado: boolean }[] }>().itens).toMatchObject([
      { id: sistemaId, arquivado: true },
    ]);

    const avaliacao = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/avaliacoes',
      headers: { cookie },
      payload: { sistemaId, perfil: 'PASSIVO' },
    });
    expect(avaliacao.statusCode).toBe(422);
    expect(avaliacao.json<ErroJson>().erro.codigo).toBe('SISTEMA_ARQUIVADO');

    const lista = await ambiente.app.inject({ method: 'GET', url: '/v1/agendamentos', headers: { cookie } });
    expect(lista.json<{ itens: { ativo: boolean }[] }>().itens[0]?.ativo).toBe(false);
    const retomar = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/agendamentos/${agendamentoId}`,
      headers: { cookie },
      payload: { ativo: true },
    });
    expect(retomar.statusCode).toBe(422);
  });

  it('trocar o método devolve a verificação a PENDENTE com novo token e instruções', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'metodo');
    const sistemaId = await cadastrarSistema(cookie);
    const antes = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistemaId}`,
      headers: { cookie },
    });
    expect(antes.json()).toMatchObject({ verificacao: { estado: 'VERIFICADO' } });
    const instrucoesAntes = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistemaId}/verificacao`,
      headers: { cookie },
    });

    const troca = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/sistemas/${sistemaId}/metodo`,
      headers: { cookie },
      payload: { metodo: 'DNS_TXT' },
    });
    expect(troca.statusCode).toBe(200);
    const instrucoes = troca.json<{ metodo: string; token: string; registroDns?: unknown }>();
    expect(instrucoes.metodo).toBe('DNS_TXT');
    expect(instrucoes.token).toMatch(/^[0-9a-f]{32}$/);
    expect(instrucoes.token).not.toBe(instrucoesAntes.json<{ token: string }>().token);
    expect(instrucoes.registroDns).toBeDefined();

    const depois = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/sistemas/${sistemaId}`,
      headers: { cookie },
    });
    expect(depois.json()).toMatchObject({ verificacao: { estado: 'PENDENTE', metodo: 'DNS_TXT' } });
  });
});

describe('agendamentos', () => {
  it('cria, lista, pausa, retoma e remove, mantendo o agendador sincronizado', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'agenda');
    const sistemaId = await cadastrarSistema(cookie);

    const semAutorizacao = await criarAgendamento(cookie, {
      sistemaId,
      perfil: 'PADRAO',
      frequencia: 'DIARIA',
      horario: '02:00',
    });
    expect(semAutorizacao.statusCode).toBe(400);

    const criado = await criarAgendamento(cookie, {
      sistemaId,
      perfil: 'PADRAO',
      frequencia: 'MENSAL',
      diaDoMes: 10,
      horario: '04:15',
      autorizacao: { responsavel: 'Maria Souza', referencia: 'OS-123', aceito: true },
    });
    expect(criado.statusCode).toBe(201);
    const agendamento = criado.json<{
      id: string;
      sistemaNome: string;
      ativo: boolean;
      autorizacao: { responsavel: string };
    }>();
    expect(agendamento).toMatchObject({
      sistemaNome: 'Sistema 0',
      ativo: true,
      autorizacao: { responsavel: 'Maria Souza' },
    });
    expect(ambiente.filas.agendamentos.get(agendamento.id)).toMatchObject({
      frequencia: 'MENSAL',
      horario: '04:15',
      diaDoMes: 10,
    });

    const lista = await ambiente.app.inject({ method: 'GET', url: '/v1/agendamentos', headers: { cookie } });
    expect(lista.json<{ itens: { id: string }[] }>().itens.map((a) => a.id)).toEqual([agendamento.id]);

    const pausado = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/agendamentos/${agendamento.id}`,
      headers: { cookie },
      payload: { ativo: false },
    });
    expect(pausado.json()).toMatchObject({ ativo: false, proximaExecucaoEm: null });
    expect(ambiente.filas.agendamentos.has(agendamento.id)).toBe(false);

    const retomado = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/agendamentos/${agendamento.id}`,
      headers: { cookie },
      payload: { ativo: true },
    });
    expect(retomado.json()).toMatchObject({ ativo: true });
    expect(ambiente.filas.agendamentos.has(agendamento.id)).toBe(true);

    const removido = await ambiente.app.inject({
      method: 'DELETE',
      url: `/v1/agendamentos/${agendamento.id}`,
      headers: { cookie },
    });
    expect(removido.statusCode).toBe(204);
    expect(ambiente.filas.agendamentos.has(agendamento.id)).toBe(false);
    const vazia = await ambiente.app.inject({ method: 'GET', url: '/v1/agendamentos', headers: { cookie } });
    expect(vazia.json<{ itens: unknown[] }>().itens).toHaveLength(0);

    const auditoria = await ambiente.app.inject({ method: 'GET', url: '/v1/auditoria', headers: { cookie } });
    const acoes = auditoria.json<{ itens: { acao: string }[] }>().itens.map((item) => item.acao);
    expect(acoes).toEqual(
      expect.arrayContaining(['AGENDAMENTO_CRIADO', 'AGENDAMENTO_ALTERADO', 'AGENDAMENTO_REMOVIDO']),
    );
  });

  it('recusa agendar sistema não verificado', async () => {
    const { cookie } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'agenda-nv');
    const sistemaId = await cadastrarSistema(cookie, 0, false);
    const resposta = await criarAgendamento(cookie, {
      sistemaId,
      frequencia: 'DIARIA',
      horario: '01:00',
    });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<ErroJson>().erro.codigo).toBe('SISTEMA_NAO_VERIFICADO');
  });

  it('o disparo de um agendamento pausado ou removido é ignorado', async () => {
    const { cookie, organizacaoId } = await cadastrarOrganizacaoDeTeste(ambiente.app, 'agenda-ign');
    const sistemaId = await cadastrarSistema(cookie);
    const criado = await criarAgendamento(cookie, { sistemaId, frequencia: 'DIARIA', horario: '01:00' });
    const { id } = criado.json<{ id: string }>();
    await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/agendamentos/${id}`,
      headers: { cookie },
      payload: { ativo: false },
    });
    expect(await ambiente.app.servicos.agendamentos.disparar(organizacaoId, id)).toBe('IGNORADO');
    expect(ambiente.filas.avaliacoes).toHaveLength(0);
  });
});
