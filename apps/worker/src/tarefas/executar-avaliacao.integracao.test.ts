import { createConnection } from 'node:net';
import type { EventoDeResultado, TarefaExecutarAvaliacao } from '@bastion/contratos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarClienteHttp } from '../guardiao-de-escopo/cliente-http';
import { LimitadorDeTaxa } from '../guardiao-de-escopo/limitador-de-taxa';
import { sondarTls } from '../guardiao-de-escopo/sonda-tls';
import type { DadosDoEvento } from '../resultados';
import { criarExecutorDeAvaliacao } from './executar-avaliacao';

/**
 * Roda o executor REAL contra o alvo de teste do Compose (`pnpm infra:subir`).
 * O alvo é inseguro de propósito: ver infra/alvo-de-teste/nginx.conf.
 */
const HOST = 'localhost';
const PORTA = 8443;

function alvoNoAr(): Promise<boolean> {
  return new Promise((resolver) => {
    const socket = createConnection({ host: HOST, port: PORTA });
    socket.setTimeout(2_000);
    socket.once('connect', () => {
      socket.destroy();
      resolver(true);
    });
    socket.once('error', () => resolver(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolver(false);
    });
  });
}

const cliente = criarClienteHttp({ permitirRedesPrivadas: true, limitador: new LimitadorDeTaxa(50) });

beforeAll(async () => {
  if (!(await alvoNoAr())) {
    throw new Error(`O alvo de teste não responde em ${HOST}:${PORTA}; rode \`pnpm infra:subir\`.`);
  }
});

afterAll(async () => {
  await cliente.fechar();
});

describe('executor de avaliação contra o alvo de teste', () => {
  it('encontra as falhas propositais do alvo', async () => {
    const eventos: DadosDoEvento[] = [];
    const executor = criarExecutorDeAvaliacao({
      clienteHttp: cliente,
      sondaTls: (alvo) => sondarTls({ ...alvo, permitirRedesPrivadas: true }),
      publicador: {
        publicar: (dados) => {
          eventos.push(dados);
          return Promise.resolve({} as EventoDeResultado);
        },
      },
      cancelamento: { foiCancelada: () => Promise.resolve(false) },
      relogio: () => Date.now(),
    });

    const tarefa: TarefaExecutarAvaliacao = {
      avaliacaoId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      organizacaoId: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      sistemaId: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      perfil: 'PASSIVO',
      urlDeHomologacao: `https://${HOST}:${PORTA}/`,
      escopo: {
        hostsPermitidos: [HOST],
        dominiosBloqueados: ['producao.exemplo.com'],
        requisicoesPorSegundo: 5,
        tempoMaximoMs: 120_000,
      },
    };
    await executor.executar(tarefa);

    const falha = eventos.find((evento) => evento.tipo === 'avaliacao-falhou');
    expect(falha).toBeUndefined();
    expect(eventos.at(-1)?.tipo).toBe('avaliacao-finalizada');

    const tipos = eventos.flatMap((evento) => (evento.tipo === 'constatacao' ? [evento.constatacao.tipo] : []));
    expect(tipos).toEqual(
      expect.arrayContaining([
        'CABECALHO_CSP_AUSENTE',
        'CABECALHO_HSTS_AUSENTE',
        'CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE',
        'VERSAO_EXPOSTA_SERVER',
        'VERSAO_EXPOSTA_X_POWERED_BY',
        'COOKIE_SEM_HTTPONLY',
        'TLS_CERTIFICADO_NAO_CONFIAVEL',
        'TLS_CERTIFICADO_EXPIRANDO',
      ]),
    );

    const cookies = eventos.flatMap((evento) =>
      evento.tipo === 'constatacao' && evento.constatacao.local === 'cookie:sessao' ? [evento.constatacao.tipo] : [],
    );
    expect(cookies).toEqual(
      expect.arrayContaining(['COOKIE_SEM_SECURE', 'COOKIE_SEM_HTTPONLY', 'COOKIE_SEM_SAMESITE']),
    );
    expect(eventos.some((evento) => evento.tipo === 'requisicao-do-guardiao' && evento.decisao === 'PERMITIDA')).toBe(
      true,
    );
  });
});
