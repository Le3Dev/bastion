import type { AchadoDto, AchadoResumoDto, CorpoDeMudancaDeEstado } from '@bastion/contratos';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { emContextoDaOrganizacao } from '../../compartilhado/banco/conexao';
import {
  criarAmbienteDeTeste,
  type AmbienteDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';
import {
  constatacaoDeTeste,
  criarCenario,
  criarServicoDeAchados,
  inserirAvaliacao,
  type CenarioDeTeste,
} from './cenario-de-teste';

let ambiente: AmbienteDeTeste;

const agendarVigilancia = vi.fn<(tarefa: unknown, atrasoMs: number) => Promise<void>>();
const servico = () => criarServicoDeAchados(ambiente, { agendarVigilancia });

beforeAll(async () => {
  ambiente = await criarAmbienteDeTeste();
});
beforeEach(async () => {
  await ambiente.limpar();
  agendarVigilancia.mockReset();
  agendarVigilancia.mockResolvedValue(undefined);
});
afterAll(async () => {
  await ambiente.encerrar();
});

interface Pagina {
  itens: AchadoResumoDto[];
  proximaPagina: string | null;
}

const registrar = async (
  cenario: CenarioDeTeste,
  avaliacaoId: string,
  sobrescrever: Parameters<typeof constatacaoDeTeste>[0] = {},
): Promise<AchadoResumoDto> =>
  emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, (tx) =>
    servico().registrarConstatacao(tx, {
      organizacaoId: cenario.organizacaoId,
      sistemaId: cenario.sistemaId,
      avaliacaoId,
      constatacao: constatacaoDeTeste(sobrescrever),
    }),
  );

const alterar = (cookie: string, id: string, payload: Record<string, unknown>) =>
  ambiente.app.inject({ method: 'PATCH', url: `/v1/achados/${id}`, headers: { cookie }, payload });

const obter = async (cookie: string, id: string): Promise<AchadoDto> => {
  const resposta = await ambiente.app.inject({
    method: 'GET',
    url: `/v1/achados/${id}`,
    headers: { cookie },
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<AchadoDto>();
};

describe('deduplicação de achados', () => {
  it('a mesma impressão em avaliações diferentes vira 1 achado com 2 ocorrências', async () => {
    const cenario = await criarCenario(ambiente, 'dedup');
    const primeira = await inserirAvaliacao(ambiente, cenario);
    const segunda = await inserirAvaliacao(ambiente, cenario);

    const a = await registrar(cenario, primeira);
    const b = await registrar(cenario, segunda);
    expect(b.id).toBe(a.id);
    expect(b.ocorrencias).toBe(2);
    expect(a.sistemaNome).toBe('Portal de homologação');

    // Registrar de novo na mesma avaliação é idempotente.
    expect((await registrar(cenario, segunda)).ocorrencias).toBe(2);

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/achados',
      headers: { cookie: cenario.cookie },
    });
    expect(lista.json<Pagina>().itens).toHaveLength(1);

    const detalhe = await obter(cenario.cookie, a.id);
    expect(detalhe.ocorrencias).toBe(2);
    expect([...detalhe.avaliacaoIds].sort()).toEqual([primeira, segunda].sort());
    expect(detalhe.estado).toBe('NOVO');
    expect(detalhe.transicoesPossiveis).toEqual(['CONFIRMADO', 'RISCO_ACEITO']);

    for (const avaliacaoId of [primeira, segunda]) {
      const daAvaliacao = await ambiente.app.inject({
        method: 'GET',
        url: `/v1/avaliacoes/${avaliacaoId}/achados`,
        headers: { cookie: cenario.cookie },
      });
      expect(daAvaliacao.json<Pagina>().itens.map((i) => i.id)).toEqual([a.id]);
    }
  });
});

describe('listagem', () => {
  it('ordena por severidade e última vez, pagina com cursor e esconde os fechados', async () => {
    const cenario = await criarCenario(ambiente, 'lista');
    const avaliacaoId = await inserirAvaliacao(ambiente, cenario);
    const baixa = await registrar(cenario, avaliacaoId, {
      tipo: 'VERSAO_EXPOSTA_SERVER',
      severidade: 'BAIXA',
      titulo: 'Versão do servidor exposta',
      local: '/',
    });
    const critica = await registrar(cenario, avaliacaoId, {
      tipo: 'HTTPS_AUSENTE',
      severidade: 'CRITICA',
      titulo: 'HTTPS ausente',
      local: '/',
    });
    const alta = await registrar(cenario, avaliacaoId);

    const url = (consulta: string) => `/v1/achados?${consulta}`;
    const primeira = await ambiente.app.inject({
      method: 'GET',
      url: url('limite=2'),
      headers: { cookie: cenario.cookie },
    });
    const paginaUm = primeira.json<Pagina>();
    expect(paginaUm.itens.map((i) => i.id)).toEqual([critica.id, alta.id]);
    expect(paginaUm.proximaPagina).not.toBeNull();

    const segunda = await ambiente.app.inject({
      method: 'GET',
      url: url(`limite=2&pagina=${paginaUm.proximaPagina as string}`),
      headers: { cookie: cenario.cookie },
    });
    const paginaDois = segunda.json<Pagina>();
    expect(paginaDois.itens.map((i) => i.id)).toEqual([baixa.id]);
    expect(paginaDois.proximaPagina).toBeNull();

    const filtrada = await ambiente.app.inject({
      method: 'GET',
      url: url('severidade=CRITICA,BAIXA&busca=https'),
      headers: { cookie: cenario.cookie },
    });
    expect(filtrada.json<Pagina>().itens.map((i) => i.id)).toEqual([critica.id]);

    const invalida = await ambiente.app.inject({
      method: 'GET',
      url: url('severidade=ENORME'),
      headers: { cookie: cenario.cookie },
    });
    expect(invalida.statusCode).toBe(400);
    const cursorRuim = await ambiente.app.inject({
      method: 'GET',
      url: url('pagina=lixo'),
      headers: { cookie: cenario.cookie },
    });
    expect(cursorRuim.statusCode).toBe(400);

    // Aceitar o risco tira o achado da lista padrão; incluirFechados o traz de volta.
    const aceite = await alterar(cenario.cookie, baixa.id, {
      estado: 'RISCO_ACEITO',
      riscoAceito: {
        justificativa: 'Versão exposta sem impacto no ambiente interno.',
        responsavel: 'Carla Segurança',
        validoAte: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    });
    expect(aceite.statusCode).toBe(200);
    const abertos = await ambiente.app.inject({
      method: 'GET',
      url: url('limite=10'),
      headers: { cookie: cenario.cookie },
    });
    expect(abertos.json<Pagina>().itens).toHaveLength(2);
    const todos = await ambiente.app.inject({
      method: 'GET',
      url: url('limite=10&incluirFechados=true'),
      headers: { cookie: cenario.cookie },
    });
    expect(todos.json<Pagina>().itens).toHaveLength(3);
  });
});

describe('mudança de estado', () => {
  it('confirma e inicia a correção, registrando o histórico com o ator', async () => {
    const cenario = await criarCenario(ambiente, 'estado');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));

    const confirmado = await alterar(cenario.cookie, achado.id, { estado: 'CONFIRMADO' });
    expect(confirmado.statusCode).toBe(200);
    expect(confirmado.json()).toEqual({ estado: 'CONFIRMADO' });

    const emCorrecao = await alterar(cenario.cookie, achado.id, {
      estado: 'EM_CORRECAO',
      comentario: 'Time de infraestrutura cuidando.',
    });
    expect(emCorrecao.statusCode).toBe(200);

    const detalhe = await obter(cenario.cookie, achado.id);
    expect(detalhe.estado).toBe('EM_CORRECAO');
    expect(detalhe.historico.map((h) => h.para)).toEqual(['NOVO', 'CONFIRMADO', 'EM_CORRECAO']);
    expect(detalhe.historico[2]).toMatchObject({
      de: 'CONFIRMADO',
      ator: 'Dono estado',
      comentario: 'Time de infraestrutura cuidando.',
    });
    expect(detalhe.transicoesPossiveis).toEqual(['REVALIDANDO']);

    const auditoria = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria?acao=ACHADO_ESTADO_ALTERADO',
      headers: { cookie: cenario.cookie },
    });
    expect(auditoria.json<{ itens: unknown[] }>().itens).toHaveLength(2);
  });

  it('recusa transição inválida com 422', async () => {
    const cenario = await criarCenario(ambiente, 'invalida');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    const resposta = await alterar(cenario.cookie, achado.id, { estado: 'EM_CORRECAO' });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<{ erro: { codigo: string } }>().erro.codigo).toBe('TRANSICAO_INVALIDA');
  });

  it('manda CORRIGIDO e REVALIDANDO pela revalidação (422)', async () => {
    const cenario = await criarCenario(ambiente, 'direto');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    for (const estado of ['CORRIGIDO', 'REVALIDANDO']) {
      const resposta = await alterar(cenario.cookie, achado.id, { estado });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json<{ erro: { mensagem: string } }>().erro.mensagem).toBe(
        'Use a revalidação: um achado só é corrigido depois de uma nova avaliação.',
      );
    }
  });

  it('exige revalidar a partir de EM_CORRECAO (422)', async () => {
    const cenario = await criarCenario(ambiente, 'revalidar');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: `/v1/achados/${achado.id}/revalidar`,
      headers: { cookie: cenario.cookie },
    });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<{ erro: { mensagem: string } }>().erro.mensagem).toBe(
      'Inicie a correção antes de pedir revalidação.',
    );
  });

  it('achado inexistente devolve 404', async () => {
    const cenario = await criarCenario(ambiente, 'nada');
    const resposta = await alterar(cenario.cookie, '3f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10', {
      estado: 'CONFIRMADO',
    });
    expect(resposta.statusCode).toBe(404);
  });
});

describe('aceite de risco', () => {
  const riscoValido = (validoAte: string): CorpoDeMudancaDeEstado => ({
    estado: 'RISCO_ACEITO',
    riscoAceito: {
      justificativa: 'Correção depende de troca do balanceador no próximo trimestre.',
      responsavel: 'Carla Segurança',
      validoAte,
    },
  });

  it('sem os dados do risco devolve 400', async () => {
    const cenario = await criarCenario(ambiente, 'risco400');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    const resposta = await alterar(cenario.cookie, achado.id, { estado: 'RISCO_ACEITO' });
    expect(resposta.statusCode).toBe(400);
  });

  it('com data passada devolve 422', async () => {
    const cenario = await criarCenario(ambiente, 'risco422');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    const resposta = await alterar(
      cenario.cookie,
      achado.id,
      riscoValido(new Date(Date.now() - 86_400_000).toISOString()),
    );
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<{ erro: { codigo: string } }>().erro.codigo).toBe('VALIDADE_INVALIDA');
  });

  it('válido grava o aceite e agenda a vigilância do vencimento', async () => {
    const cenario = await criarCenario(ambiente, 'riscook');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    const validoAte = new Date(Date.now() + 7 * 86_400_000);

    const resposta = await servico().mudarEstado(
      cenario.contexto,
      achado.id,
      riscoValido(validoAte.toISOString()),
    );
    expect(resposta).toEqual({ estado: 'RISCO_ACEITO' });
    expect(agendarVigilancia).toHaveBeenCalledTimes(1);
    const [tarefa, atraso] = agendarVigilancia.mock.calls[0] as [unknown, number];
    expect(tarefa).toEqual({
      tipo: 'vencimento-do-risco',
      achadoId: achado.id,
      organizacaoId: cenario.organizacaoId,
    });
    expect(atraso).toBeGreaterThan(6 * 86_400_000);
    expect(atraso).toBeLessThanOrEqual(7 * 86_400_000);

    const detalhe = await obter(cenario.cookie, achado.id);
    expect(detalhe.riscoAceito).toMatchObject({ responsavel: 'Carla Segurança' });

    const auditoria = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/auditoria?acao=RISCO_ACEITO',
      headers: { cookie: cenario.cookie },
    });
    expect(auditoria.json<{ itens: unknown[] }>().itens).toHaveLength(1);
  });

  it('o aceite vencido volta o achado para CONFIRMADO', async () => {
    const cenario = await criarCenario(ambiente, 'vencido');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    await servico().mudarEstado(cenario.contexto, achado.id, {
      estado: 'RISCO_ACEITO',
      riscoAceito: {
        justificativa: 'Correção depende de troca do balanceador no próximo trimestre.',
        responsavel: 'Carla Segurança',
        validoAte: new Date(Date.now() + 1500).toISOString(),
      },
    });
    await servico().verificarVencimentoDoRisco(cenario.organizacaoId, achado.id);
    expect((await obter(cenario.cookie, achado.id)).estado).toBe('RISCO_ACEITO');

    await new Promise((resolver) => setTimeout(resolver, 1600));
    await servico().verificarVencimentoDoRisco(cenario.organizacaoId, achado.id);
    const detalhe = await obter(cenario.cookie, achado.id);
    expect(detalhe.estado).toBe('CONFIRMADO');
    expect(detalhe.riscoAceito).toBeNull();
  });

  it('DESENVOLVEDOR não aceita risco (403), mas inicia a correção', async () => {
    const cenario = await criarCenario(ambiente, 'perm');
    const achado = await registrar(cenario, await inserirAvaliacao(ambiente, cenario));
    const chave = await ambiente.app.inject({
      method: 'POST',
      url: '/v1/chaves-de-api',
      headers: { cookie: cenario.cookie },
      payload: { nome: 'Pipeline', papel: 'DESENVOLVEDOR' },
    });
    const { segredo } = chave.json<{ segredo: string }>();
    const autorizacao = { authorization: `Bearer ${segredo}` };

    const recusado = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/achados/${achado.id}`,
      headers: autorizacao,
      payload: riscoValido(new Date(Date.now() + 86_400_000 * 5).toISOString()),
    });
    expect(recusado.statusCode).toBe(403);

    const triagem = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/achados/${achado.id}`,
      headers: autorizacao,
      payload: { estado: 'CONFIRMADO' },
    });
    expect(triagem.statusCode).toBe(403);

    await alterar(cenario.cookie, achado.id, { estado: 'CONFIRMADO' });
    const correcao = await ambiente.app.inject({
      method: 'PATCH',
      url: `/v1/achados/${achado.id}`,
      headers: autorizacao,
      payload: { estado: 'EM_CORRECAO' },
    });
    expect(correcao.statusCode).toBe(200);
  });
});

describe('revalidação', () => {
  const prepararEmCorrecao = async (cenario: CenarioDeTeste, avaliacaoId: string) => {
    const achado = await registrar(cenario, avaliacaoId);
    expect((await alterar(cenario.cookie, achado.id, { estado: 'CONFIRMADO' })).statusCode).toBe(200);
    expect((await alterar(cenario.cookie, achado.id, { estado: 'EM_CORRECAO' })).statusCode).toBe(200);
    return achado;
  };

  it('sem ocorrência na nova avaliação o achado vira CORRIGIDO', async () => {
    const cenario = await criarCenario(ambiente, 'corrigido');
    const achado = await prepararEmCorrecao(cenario, await inserirAvaliacao(ambiente, cenario));
    const revalidacao = await inserirAvaliacao(ambiente, cenario);

    const resposta = await servico().revalidar(cenario.contexto, achado.id, async () => ({
      id: revalidacao,
      estado: 'NA_FILA',
    }));
    expect(resposta).toEqual({ avaliacaoId: revalidacao });
    expect((await obter(cenario.cookie, achado.id)).estado).toBe('REVALIDANDO');

    await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, (tx) =>
      servico().concluirRevalidacao(tx, { achadoId: achado.id, avaliacaoId: revalidacao }),
    );
    const detalhe = await obter(cenario.cookie, achado.id);
    expect(detalhe.estado).toBe('CORRIGIDO');
    expect(detalhe.historico.at(-1)).toMatchObject({ de: 'REVALIDANDO', para: 'CORRIGIDO' });
  });

  it('com ocorrência na nova avaliação o achado é REABERTO', async () => {
    const cenario = await criarCenario(ambiente, 'reaberto');
    const achado = await prepararEmCorrecao(cenario, await inserirAvaliacao(ambiente, cenario));
    const revalidacao = await inserirAvaliacao(ambiente, cenario);
    await servico().revalidar(cenario.contexto, achado.id, async () => ({
      id: revalidacao,
      estado: 'NA_FILA',
    }));

    await registrar(cenario, revalidacao);
    await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, (tx) =>
      servico().concluirRevalidacao(tx, { achadoId: achado.id, avaliacaoId: revalidacao }),
    );
    const detalhe = await obter(cenario.cookie, achado.id);
    expect(detalhe.estado).toBe('REABERTO');
    expect(detalhe.ocorrencias).toBe(2);
  });

  it('falha ao criar a avaliação não muda o achado', async () => {
    const cenario = await criarCenario(ambiente, 'falha');
    const achado = await prepararEmCorrecao(cenario, await inserirAvaliacao(ambiente, cenario));
    await expect(
      servico().revalidar(cenario.contexto, achado.id, async () => {
        throw new Error('Sistema sem propriedade verificada');
      }),
    ).rejects.toThrow(/propriedade/);
    expect((await obter(cenario.cookie, achado.id)).estado).toBe('EM_CORRECAO');
  });
});

describe('contagens', () => {
  it('conta os achados em aberto por severidade e por avaliação', async () => {
    const cenario = await criarCenario(ambiente, 'contagem');
    const avaliacaoId = await inserirAvaliacao(ambiente, cenario);
    await registrar(cenario, avaliacaoId);
    await registrar(cenario, avaliacaoId, { tipo: 'HTTPS_AUSENTE', severidade: 'CRITICA', local: '/' });
    const outraAvaliacao = await inserirAvaliacao(ambiente, cenario);

    const resultado = await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, async (tx) => ({
      geral: await servico().contagemEmAbertoPorSeveridade(tx),
      daAvaliacao: await servico().contagemDaAvaliacao(tx, avaliacaoId),
      daOutra: await servico().contagemDaAvaliacao(tx, outraAvaliacao),
      graves: await servico().listarCriticosEAltosEmAberto(tx, 5),
    }));
    expect(resultado.geral).toEqual({ CRITICA: 1, ALTA: 1, MEDIA: 0, BAIXA: 0 });
    expect(resultado.daAvaliacao).toEqual({ CRITICA: 1, ALTA: 1, MEDIA: 0, BAIXA: 0 });
    expect(resultado.daOutra).toEqual({ CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 });
    expect(resultado.graves.map((g) => g.severidade)).toEqual(['CRITICA', 'ALTA']);
  });
});

describe('isolamento entre organizações', () => {
  it('outra organização não enxerga nem altera o achado', async () => {
    const a = await criarCenario(ambiente, 'isola-a');
    const b = await criarCenario(ambiente, 'isola-b');
    const achado = await registrar(a, await inserirAvaliacao(ambiente, a));

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/achados?incluirFechados=true',
      headers: { cookie: b.cookie },
    });
    expect(lista.json<Pagina>().itens).toEqual([]);

    const leitura = await ambiente.app.inject({
      method: 'GET',
      url: `/v1/achados/${achado.id}`,
      headers: { cookie: b.cookie },
    });
    expect(leitura.statusCode).toBe(404);
    expect((await alterar(b.cookie, achado.id, { estado: 'CONFIRMADO' })).statusCode).toBe(404);
    expect((await obter(a.cookie, achado.id)).estado).toBe('NOVO');
  });
});
