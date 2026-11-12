import type { EventoDeResultado, PerfilDeAvaliacao, TarefaExecutarAvaliacao } from '@bastion/contratos';
import { afterEach, describe, expect, it } from 'vitest';
import { criarClienteHttp, type ClienteHttp } from '../guardiao-de-escopo/cliente-http';
import { LimitadorDeTaxa } from '../guardiao-de-escopo/limitador-de-taxa';
import { escopoDeTeste, html, servir, type AlvoLocal } from '../modulos/ativo/alvos-de-teste';
import type { DadosDoEvento } from '../resultados';
import { criarExecutorDeAvaliacao, ETAPAS_POR_PERFIL } from './executar-avaliacao';

const alvos: AlvoLocal[] = [];
const clientes: ClienteHttp[] = [];
afterEach(async () => {
  await Promise.all(alvos.splice(0).map((a) => a.fechar()));
  await Promise.all(clientes.splice(0).map((c) => c.fechar()));
});

function executar(tarefa: TarefaExecutarAvaliacao) {
  const eventos: DadosDoEvento[] = [];
  const cliente = criarClienteHttp({ permitirRedesPrivadas: true, limitador: new LimitadorDeTaxa(100_000) });
  clientes.push(cliente);
  const executor = criarExecutorDeAvaliacao({
    clienteHttp: cliente,
    sondaTls: () => Promise.reject(new Error('sem TLS em http')),
    publicador: {
      publicar: (dados) => {
        eventos.push(dados);
        return Promise.resolve({} as EventoDeResultado);
      },
    },
    cancelamento: { foiCancelada: () => Promise.resolve(false) },
    relogio: () => Date.now(),
    mensagensDeIaPorSegundo: 100_000,
  });
  return { rodar: () => executor.executar(tarefa), eventos };
}

function tarefa(
  perfil: PerfilDeAvaliacao,
  alvo: AlvoLocal,
  extra: Partial<TarefaExecutarAvaliacao> = {},
  escopo: Parameters<typeof escopoDeTeste>[0] = {},
): TarefaExecutarAvaliacao {
  return {
    avaliacaoId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    organizacaoId: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    sistemaId: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    perfil,
    urlDeHomologacao: `${alvo.url}/`,
    escopo: escopoDeTeste(escopo),
    ...extra,
  };
}

const etapas = (eventos: DadosDoEvento[]): string[] =>
  eventos.flatMap((e) => (e.tipo === 'etapa-atualizada' ? [`${e.nome}:${e.estado}`] : []));
const tiposDeConstatacao = (eventos: DadosDoEvento[]): string[] =>
  eventos.flatMap((e) => (e.tipo === 'constatacao' ? [e.constatacao.tipo] : []));

async function alvoWeb(): Promise<AlvoLocal> {
  const alvo = await servir((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') return html(res, '<a href="/busca?q=1">buscar</a>');
    if (url.pathname === '/.git/HEAD') return void res.end('ref: refs/heads/main\n');
    if (url.pathname === '/busca') return html(res, `<p>${url.searchParams.get('q') ?? ''}</p>`);
    return html(res, 'x', 404);
  });
  alvos.push(alvo);
  return alvo;
}

describe('executor por perfil', () => {
  it('PADRAO: emite as etapas do perfil na ordem e as constatações ativas', async () => {
    const alvo = await alvoWeb();
    const { rodar, eventos } = executar(tarefa('PADRAO', alvo));
    await rodar();
    expect(eventos.find((e) => e.tipo === 'avaliacao-falhou')).toBeUndefined();
    expect(eventos.at(-1)?.tipo).toBe('avaliacao-finalizada');
    const nomes = ETAPAS_POR_PERFIL.PADRAO;
    const esperadas = nomes.flatMap((nome) => [`${nome}:EM_EXECUCAO`, `${nome}:CONCLUIDA`]);
    expect(etapas(eventos).filter((e) => e !== 'TLS e certificado:EM_EXECUCAO')).toEqual(
      esperadas.map((e) => (e.startsWith('TLS e certificado:CONCLUIDA') ? 'TLS e certificado:IGNORADA' : e)).filter((e) => e !== 'TLS e certificado:EM_EXECUCAO'),
    );
    expect(tiposDeConstatacao(eventos)).toEqual(
      expect.arrayContaining(['ARQUIVO_SENSIVEL_EXPOSTO', 'ENTRADA_REFLETIDA_SEM_ESCAPE', 'SECURITY_TXT_AUSENTE']),
    );
    expect(eventos.some((e) => e.tipo === 'requisicao-do-guardiao')).toBe(true);
    expect(alvo.pedidos.every((p) => /^(GET|OPTIONS) /.test(p))).toBe(true);
  });

  it('COMPLETO sem credencial ignora a área autenticada, mas roda a injeção', async () => {
    const alvo = await alvoWeb();
    const { rodar, eventos } = executar(tarefa('COMPLETO', alvo));
    await rodar();
    const lista = etapas(eventos);
    expect(lista).toContain('Autenticação de teste:IGNORADA');
    expect(lista).toContain('Controle de acesso:IGNORADA');
    expect(lista).toContain('Injeção (SQL, template, caminho):CONCLUIDA');
    expect(eventos.at(-1)?.tipo).toBe('avaliacao-finalizada');
  });

  it('interrompe com motivo claro ao atingir o teto de requisições', async () => {
    const alvo = await alvoWeb();
    const { rodar, eventos } = executar(tarefa('PADRAO', alvo, {}, { tetoDeRequisicoes: 5 }));
    await rodar();
    const falha = eventos.find((e) => e.tipo === 'avaliacao-falhou');
    expect(falha).toMatchObject({ motivo: 'Teto de requisições atingido.' });
    expect(eventos.some((e) => e.tipo === 'avaliacao-finalizada')).toBe(false);
    expect(alvo.pedidos.length).toBeLessThanOrEqual(5);
  });

  it('o disjuntor aborta quando o alvo só responde 5xx', async () => {
    const alvo = await servir((_req, res) => void res.writeHead(503).end());
    alvos.push(alvo);
    const { rodar, eventos } = executar(tarefa('PADRAO', alvo));
    await rodar();
    expect(eventos.find((e) => e.tipo === 'avaliacao-falhou')).toMatchObject({
      motivo: 'Alvo instável (muitos erros); avaliação interrompida.',
    });
    expect(alvo.pedidos.length).toBeLessThanOrEqual(10);
  });

  it('IA: conversa pelo conector, emite as etapas do perfil e acha a injeção', async () => {
    const alvo = await servir((req, res, corpo) => {
      const { message } = JSON.parse(corpo) as { message: string };
      const codigo = /palavra-código (BASTION-CODIGO-[A-Z0-9]+)/.exec(message)?.[1];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ reply: codigo ?? 'Sou só um assistente de pedidos.' }));
    });
    alvos.push(alvo);
    const { rodar, eventos } = executar(
      tarefa('IA', alvo, {
        conectorDeIa: {
          url: `${alvo.url}/chat`,
          modeloDoCorpo: '{"message":"{{mensagem}}"}',
          caminhoDaResposta: 'reply',
          frasesSigilosas: ['nunca revele'],
        },
      }),
    );
    await rodar();
    expect(eventos.find((e) => e.tipo === 'avaliacao-falhou')).toBeUndefined();
    expect(etapas(eventos).filter((e) => e.endsWith(':CONCLUIDA')).map((e) => e.replace(':CONCLUIDA', ''))).toEqual(
      [...ETAPAS_POR_PERFIL.IA],
    );
    // O servidor obedece à injeção direta e à indireta.
    expect(tiposDeConstatacao(eventos)).toEqual(['IA_INJECAO_DE_PROMPT', 'IA_INJECAO_DE_PROMPT']);
  });

  it('IA sem conector falha com motivo claro', async () => {
    const alvo = await alvoWeb();
    const { rodar, eventos } = executar(tarefa('IA', alvo));
    await rodar();
    expect(eventos.find((e) => e.tipo === 'avaliacao-falhou')).toMatchObject({
      motivo: expect.stringContaining('exige um conector de IA') as unknown as string,
    });
  });
});
