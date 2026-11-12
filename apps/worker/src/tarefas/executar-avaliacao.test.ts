import type { EventoDeResultado, TarefaExecutarAvaliacao } from '@bastion/contratos';
import { describe, expect, it, vi } from 'vitest';
import { RequisicaoBloqueada, type RespostaHttp } from '../guardiao-de-escopo/cliente-http';
import type { DadosDoTls } from '../modulos/passivo';
import type { DadosDoEvento } from '../resultados';
import { criarExecutorDeAvaliacao, ETAPAS, type DependenciasDoExecutor } from './executar-avaliacao';

const AVALIACAO = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ORGANIZACAO = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const SISTEMA = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function tarefa(url: string, extra: Partial<TarefaExecutarAvaliacao['escopo']> = {}): TarefaExecutarAvaliacao {
  return {
    avaliacaoId: AVALIACAO,
    organizacaoId: ORGANIZACAO,
    sistemaId: SISTEMA,
    perfil: 'PASSIVO',
    urlDeHomologacao: url,
    escopo: {
      hostsPermitidos: ['homolog.exemplo.com'],
      dominiosBloqueados: ['exemplo.com.br'],
      requisicoesPorSegundo: 5,
      tempoMaximoMs: 60_000,
      ...extra,
    },
  };
}

const respostaInsegura = (url: string): RespostaHttp => ({
  url,
  status: 200,
  cabecalhos: {
    server: 'nginx/1.18.0',
    'x-powered-by': 'PHP/7.4.3',
    'set-cookie': 'sessao=abc; Path=/',
  },
  trechoDoCorpo: '',
});

const tlsDoAlvo: DadosDoTls = {
  host: 'homolog.exemplo.com',
  protocolosAceitos: ['TLSv1.2', 'TLSv1.3'],
  certificado: {
    validoDe: new Date('2020-01-01'),
    validoAte: new Date(Date.now() + 5 * 24 * 3600 * 1000),
    emissor: 'Alvo',
    sujeito: 'homolog.exemplo.com',
    confiavel: false,
    nomeConfere: true,
    motivoDaDesconfianca: 'DEPTH_ZERO_SELF_SIGNED_CERT',
  },
};

function montar(sobrescritas: Partial<DependenciasDoExecutor> = {}) {
  const eventos: DadosDoEvento[] = [];
  const clienteHttp = {
    requisitar: vi.fn((pedido: Parameters<DependenciasDoExecutor['clienteHttp']['requisitar']>[0]) => {
      pedido.aoDecidir?.({
        metodo: 'GET',
        url: pedido.url,
        decisao: 'PERMITIDA',
        motivo: 'Dentro do escopo verificado',
        status: 200,
      });
      return Promise.resolve(respostaInsegura(pedido.url));
    }),
  };
  const sondaTls = vi.fn(() => Promise.resolve(tlsDoAlvo));
  const deps: DependenciasDoExecutor = {
    clienteHttp,
    sondaTls,
    publicador: {
      publicar: (dados) => {
        eventos.push(dados);
        return Promise.resolve({} as EventoDeResultado);
      },
    },
    cancelamento: { foiCancelada: () => Promise.resolve(false) },
    relogio: () => 0,
    ...sobrescritas,
  };
  return { executor: criarExecutorDeAvaliacao(deps), eventos, clienteHttp, sondaTls };
}

const tipos = (eventos: DadosDoEvento[]) => eventos.map((evento) => evento.tipo);
const etapas = (eventos: DadosDoEvento[]) =>
  eventos.flatMap((evento) => (evento.tipo === 'etapa-atualizada' ? [`${evento.nome}:${evento.estado}`] : []));

describe('executor de avaliação', () => {
  it('emite os eventos na ordem e as constatações esperadas', async () => {
    const { executor, eventos, sondaTls } = montar();
    await executor.executar(tarefa('https://homolog.exemplo.com/'));

    const lista = tipos(eventos);
    expect(lista.slice(0, 2)).toEqual(['preparacao-iniciada', 'execucao-iniciada']);
    expect(lista.slice(-3)).toEqual(['analise-iniciada', 'etapa-atualizada', 'avaliacao-finalizada']);
    expect(lista.at(-1)).toBe('avaliacao-finalizada');
    expect(lista.indexOf('requisicao-do-guardiao')).toBeGreaterThan(lista.indexOf('execucao-iniciada'));

    expect(etapas(eventos)).toEqual(ETAPAS.flatMap((nome) => [`${nome}:EM_EXECUCAO`, `${nome}:CONCLUIDA`]));
    expect(sondaTls).toHaveBeenCalledWith({ host: 'homolog.exemplo.com', porta: 443 });

    const constatacoes = eventos.flatMap((evento) =>
      evento.tipo === 'constatacao' ? [evento.constatacao.tipo] : [],
    );
    expect(constatacoes).toEqual(
      expect.arrayContaining([
        'CABECALHO_CSP_AUSENTE',
        'CABECALHO_HSTS_AUSENTE',
        'CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE',
        'TLS_CERTIFICADO_EXPIRANDO',
        'TLS_CERTIFICADO_NAO_CONFIAVEL',
        'COOKIE_SEM_HTTPONLY',
        'VERSAO_EXPOSTA_SERVER',
        'VERSAO_EXPOSTA_X_POWERED_BY',
      ]),
    );
    // Todos os eventos carregam a organização e a avaliação.
    for (const evento of eventos) {
      expect(evento).toEqual(expect.objectContaining({ organizacaoId: ORGANIZACAO, avaliacaoId: AVALIACAO }));
    }
  });

  it('ignora a etapa de TLS quando a URL é http', async () => {
    const { executor, eventos, sondaTls } = montar();
    await executor.executar(tarefa('http://homolog.exemplo.com/'));
    expect(sondaTls).not.toHaveBeenCalled();
    expect(etapas(eventos)).toContain('TLS e certificado:IGNORADA');
    const constatacoes = eventos.flatMap((evento) =>
      evento.tipo === 'constatacao' ? [evento.constatacao.tipo] : [],
    );
    expect(constatacoes).toContain('HTTPS_AUSENTE');
    expect(tipos(eventos).at(-1)).toBe('avaliacao-finalizada');
  });

  it('encerra em silêncio quando a avaliação foi cancelada', async () => {
    let consultas = 0;
    const { executor, eventos } = montar({
      // Cancela a partir da terceira conferência (depois da primeira etapa).
      cancelamento: { foiCancelada: () => Promise.resolve(++consultas > 2) },
    });
    await executor.executar(tarefa('https://homolog.exemplo.com/'));
    const lista = tipos(eventos);
    expect(lista).not.toContain('avaliacao-finalizada');
    expect(lista).not.toContain('avaliacao-falhou');
    expect(etapas(eventos)).not.toContain('TLS e certificado:EM_EXECUCAO');
  });

  it('transforma erro da requisição em avaliacao-falhou sem stack', async () => {
    const { executor, eventos } = montar({
      clienteHttp: {
        requisitar: () =>
          Promise.reject(new Error('Não foi possível conectar a homolog.exemplo.com (ECONNREFUSED).')),
      },
    });
    await executor.executar(tarefa('https://homolog.exemplo.com/'));
    const ultimo = eventos.at(-1);
    expect(ultimo).toEqual(
      expect.objectContaining({
        tipo: 'avaliacao-falhou',
        motivo: 'Não foi possível conectar a homolog.exemplo.com (ECONNREFUSED).',
      }),
    );
    expect(etapas(eventos)).toContain('Conferir propriedade e escopo:FALHOU');
    expect(JSON.stringify(ultimo)).not.toContain(' at ');
  });

  it('explica o bloqueio do Guardião', async () => {
    const { executor, eventos } = montar({
      clienteHttp: { requisitar: () => Promise.reject(new RequisicaoBloqueada('Host fora do escopo verificado')) },
    });
    await executor.executar(tarefa('https://homolog.exemplo.com/'));
    expect(eventos.at(-1)).toEqual(
      expect.objectContaining({
        tipo: 'avaliacao-falhou',
        motivo: expect.stringContaining('Host fora do escopo verificado') as unknown,
      }),
    );
  });

  it('falha sem requisitar quando o host está fora do escopo', async () => {
    const { executor, eventos, clienteHttp } = montar();
    await executor.executar(tarefa('https://outro.exemplo.net/'));
    expect(clienteHttp.requisitar).not.toHaveBeenCalled();
    expect(tipos(eventos)).toEqual(['preparacao-iniciada', 'avaliacao-falhou']);
  });

  it('falha quando a URL cai no domínio de produção declarado', async () => {
    const { executor, eventos, clienteHttp } = montar();
    await executor.executar(
      tarefa('https://www.exemplo.com.br/', { hostsPermitidos: ['www.exemplo.com.br'] }),
    );
    expect(clienteHttp.requisitar).not.toHaveBeenCalled();
    expect(eventos.at(-1)).toEqual(
      expect.objectContaining({ tipo: 'avaliacao-falhou', motivo: expect.stringContaining('produção') as unknown }),
    );
  });

  it('respeita o tempo máximo do perfil', async () => {
    let agora = 0;
    const { executor, eventos } = montar({
      relogio: () => agora,
      clienteHttp: {
        requisitar: (pedido) => {
          agora = 100_000;
          return Promise.resolve(respostaInsegura(pedido.url));
        },
      },
    });
    await executor.executar(tarefa('https://homolog.exemplo.com/', { tempoMaximoMs: 1_000 }));
    expect(eventos.at(-1)).toEqual(
      expect.objectContaining({ tipo: 'avaliacao-falhou', motivo: 'Tempo máximo do perfil excedido.' }),
    );
  });

  it('continua quando só a sonda TLS falha', async () => {
    const { executor, eventos } = montar({
      sondaTls: () => Promise.reject(new Error('Não foi possível negociar TLS (ECONNRESET).')),
    });
    await executor.executar(tarefa('https://homolog.exemplo.com/'));
    expect(etapas(eventos)).toContain('TLS e certificado:FALHOU');
    expect(tipos(eventos).at(-1)).toBe('avaliacao-finalizada');
  });

  it('rejeita tarefa inválida', async () => {
    const { executor } = montar();
    await expect(executor.executar({ avaliacaoId: 'x' })).rejects.toThrow(/Tarefa de avaliação inválida/);
  });
});
