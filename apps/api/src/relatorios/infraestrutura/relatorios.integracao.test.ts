import { existsSync } from 'node:fs';
import type { RelatorioDto, RelatorioResumoDto } from '@bastion/contratos';
import { chromium } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import {
  constatacaoDeTeste,
  criarCenario,
  criarServicoDeAchados,
  inserirAvaliacao,
  type CenarioDeTeste,
} from '../../achados/infraestrutura/cenario-de-teste';
import { emContextoDaOrganizacao } from '../../compartilhado/banco/conexao';
import { requisicoesDoGuardiao } from '../../compartilhado/banco/esquema';
import { relogioDoSistema } from '../../compartilhado/relogio';
import {
  criarAmbienteDeTeste,
  type AmbienteDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';
import type { Armazenamento } from '../../integracoes/armazenamento';
import { ServicoDeRelatorios } from '../aplicacao/ServicoDeRelatorios';

let ambiente: AmbienteDeTeste;

class ArmazenamentoEmMemoria implements Armazenamento {
  readonly objetos = new Map<string, { corpo: Uint8Array; tipo: string }>();
  async garantirBucket(): Promise<void> {}
  async enviar(chave: string, corpo: Uint8Array | string, tipo: string): Promise<void> {
    this.objetos.set(chave, {
      corpo: typeof corpo === 'string' ? new TextEncoder().encode(corpo) : corpo,
      tipo,
    });
  }
  async obter(chave: string): Promise<Uint8Array> {
    const objeto = this.objetos.get(chave);
    if (!objeto) throw new Error(`Sem objeto: ${chave}`);
    return objeto.corpo;
  }
  fechar(): void {}
}

const criarServico = (
  armazenamento: Armazenamento,
  renderizador?: (html: string) => Promise<Uint8Array>,
): ServicoDeRelatorios =>
  new ServicoDeRelatorios(
    ambiente.db,
    armazenamento,
    relogioDoSistema,
    new ServicoDeAuditoria(relogioDoSistema),
    undefined,
    renderizador,
  );

beforeAll(async () => {
  ambiente = await criarAmbienteDeTeste();
});
beforeEach(async () => {
  await ambiente.limpar();
});
afterAll(async () => {
  await ambiente.encerrar();
});

/** Avaliação com 2 achados (CRITICA e ALTA), requisições do Guardião e relatório gerado. */
const prepararRelatorio = async (cenario: CenarioDeTeste, servico = criarServico(new ArmazenamentoEmMemoria())) => {
  const avaliacaoId = await inserirAvaliacao(ambiente, cenario, 70);
  const achados = criarServicoDeAchados(ambiente, { agendarVigilancia: vi.fn() });
  await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, async (tx) => {
    for (const constatacao of [
      constatacaoDeTeste(),
      constatacaoDeTeste({
        tipo: 'HTTPS_AUSENTE',
        severidade: 'CRITICA',
        titulo: 'HTTPS ausente <img src=x>',
        local: '/',
        conformidade: { owasp: ['A02:2021', 'A05:2021'], lgpd: [] },
      }),
    ]) {
      await achados.registrarConstatacao(tx, {
        organizacaoId: cenario.organizacaoId,
        sistemaId: cenario.sistemaId,
        avaliacaoId,
        constatacao,
      });
    }
    await tx.insert(requisicoesDoGuardiao).values([
      { organizacaoId: cenario.organizacaoId, avaliacaoId, metodo: 'GET', url: 'https://homologacao.cliente.test/', decisao: 'PERMITIDA', motivo: 'Host de homologação', status: 200 },
      { organizacaoId: cenario.organizacaoId, avaliacaoId, metodo: 'GET', url: 'https://homologacao.cliente.test/login', decisao: 'PERMITIDA', motivo: 'Host de homologação', status: 200 },
      { organizacaoId: cenario.organizacaoId, avaliacaoId, metodo: 'GET', url: 'https://producao.cliente.test/', decisao: 'BLOQUEADA', motivo: 'Domínio de produção', status: null },
    ]);
  });
  const gerado = await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, (tx) =>
    servico.gerarParaAvaliacao(tx, {
      organizacaoId: cenario.organizacaoId,
      avaliacaoId,
      sistemaId: cenario.sistemaId,
      sistemaNome: 'Portal de homologação',
      notaMinima: 70,
    }),
  );
  return { avaliacaoId, ...gerado };
};

const buscar = (cookie: string, url: string, headers: Record<string, string> = {}) =>
  ambiente.app.inject({ method: 'GET', url, headers: { cookie, ...headers } });

describe('geração e consulta do relatório', () => {
  it('gera o relatório da avaliação e o devolve em JSON', async () => {
    const cenario = await criarCenario(ambiente, 'rel-json');
    const { avaliacaoId, relatorioId, nota } = await prepararRelatorio(cenario);
    expect(nota).toBe(65);

    const resposta = await buscar(cenario.cookie, `/v1/relatorios/${relatorioId}`);
    expect(resposta.statusCode).toBe(200);
    const dto = resposta.json<RelatorioDto>();
    expect(dto).toMatchObject({
      id: relatorioId,
      avaliacaoId,
      sistemaNome: 'Portal de homologação',
      perfil: 'PASSIVO',
      nota: 65,
      notaMinima: 70,
      aprovado: false,
      contagemPorSeveridade: { CRITICA: 1, ALTA: 1, MEDIA: 0, BAIXA: 0 },
      escopo: {
        urlDeHomologacao: 'https://homologacao.cliente.test',
        dominioDeProducao: 'producao.cliente.test',
        requisicoesPermitidas: 2,
        requisicoesBloqueadas: 1,
      },
    });
    expect(dto.achados.map((a) => a.severidade)).toEqual(['CRITICA', 'ALTA']);
    expect(dto.conformidade.owasp).toEqual([
      { codigo: 'A05:2021', quantidade: 2 },
      { codigo: 'A02:2021', quantidade: 1 },
    ]);
    expect(dto.resumo).toContain('reprovado');

    // Gerar de novo para a mesma avaliação devolve o mesmo relatório.
    const repetido = await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, (tx) =>
      criarServico(new ArmazenamentoEmMemoria()).gerarParaAvaliacao(tx, {
        organizacaoId: cenario.organizacaoId,
        avaliacaoId,
        sistemaId: cenario.sistemaId,
        sistemaNome: 'Portal de homologação',
        notaMinima: 70,
      }),
    );
    expect(repetido.relatorioId).toBe(relatorioId);

    const idDaAvaliacao = await emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, (tx) =>
      criarServico(new ArmazenamentoEmMemoria()).idDoRelatorioDaAvaliacao(tx, avaliacaoId),
    );
    expect(idDaAvaliacao).toBe(relatorioId);
  });

  it('devolve HTML por ?formato=html ou pelo cabeçalho Accept, com o texto escapado', async () => {
    const cenario = await criarCenario(ambiente, 'rel-html');
    const { relatorioId } = await prepararRelatorio(cenario);

    for (const resposta of [
      await buscar(cenario.cookie, `/v1/relatorios/${relatorioId}?formato=html`),
      await buscar(cenario.cookie, `/v1/relatorios/${relatorioId}`, { accept: 'text/html' }),
    ]) {
      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/html');
      expect(resposta.body).toContain('65<small>/100</small>');
      expect(resposta.body).toContain('Reprovado');
      expect(resposta.body).toContain('Envie o cabeçalho Content-Security-Policy.');
      expect(resposta.body).toContain('HTTPS ausente &lt;img src=x&gt;');
      expect(resposta.body).not.toContain('<img');
    }
  });

  it('lista os relatórios, com filtro por avaliação', async () => {
    const cenario = await criarCenario(ambiente, 'rel-lista');
    const { avaliacaoId, relatorioId } = await prepararRelatorio(cenario);

    const todos = await buscar(cenario.cookie, '/v1/relatorios');
    expect(todos.json<{ itens: RelatorioResumoDto[] }>().itens).toMatchObject([
      { id: relatorioId, avaliacaoId, nota: 65, sistemaNome: 'Portal de homologação' },
    ]);
    const filtrado = await buscar(
      cenario.cookie,
      '/v1/relatorios?avaliacaoId=3f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10',
    );
    expect(filtrado.json<{ itens: unknown[] }>().itens).toEqual([]);
  });

  it('isola os relatórios entre organizações', async () => {
    const a = await criarCenario(ambiente, 'rel-a');
    const b = await criarCenario(ambiente, 'rel-b');
    const { relatorioId } = await prepararRelatorio(a);

    expect((await buscar(b.cookie, `/v1/relatorios/${relatorioId}`)).statusCode).toBe(404);
    expect((await buscar(b.cookie, `/v1/relatorios/${relatorioId}?formato=html`)).statusCode).toBe(404);
    expect((await buscar(b.cookie, `/v1/relatorios/${relatorioId}?formato=pdf`)).statusCode).toBe(404);
    expect((await buscar(b.cookie, '/v1/relatorios')).json<{ itens: unknown[] }>().itens).toEqual([]);
    expect((await buscar(a.cookie, `/v1/relatorios/${relatorioId}`)).statusCode).toBe(200);
  });

  it('exige autenticação', async () => {
    const resposta = await ambiente.app.inject({
      method: 'GET',
      url: '/v1/relatorios/3f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10',
    });
    expect(resposta.statusCode).toBe(401);
  });
});

describe('PDF', () => {
  it('gera uma vez, guarda no armazenamento e reaproveita nas próximas', async () => {
    const cenario = await criarCenario(ambiente, 'pdf-cache');
    const armazenamento = new ArmazenamentoEmMemoria();
    const renderizador = vi.fn(async (html: string) => new TextEncoder().encode(`%PDF-falso ${html.length}`));
    const servico = criarServico(armazenamento, renderizador);
    const { relatorioId } = await prepararRelatorio(cenario, servico);

    const primeiro = await servico.gerarPdf(cenario.contexto, relatorioId);
    const segundo = await servico.gerarPdf(cenario.contexto, relatorioId);
    expect(renderizador).toHaveBeenCalledTimes(1);
    expect(renderizador.mock.calls[0]?.[0]).toContain('<!DOCTYPE html>');
    expect(primeiro.equals(segundo)).toBe(true);
    expect([...armazenamento.objetos.keys()]).toEqual([
      `relatorios/${cenario.organizacaoId}/${relatorioId}.pdf`,
    ]);
    expect(armazenamento.objetos.values().next().value?.tipo).toBe('application/pdf');
  });

  it('o PDF de outra organização é 404', async () => {
    const a = await criarCenario(ambiente, 'pdf-a');
    const b = await criarCenario(ambiente, 'pdf-b');
    const servico = criarServico(new ArmazenamentoEmMemoria(), async () => new Uint8Array([1]));
    const { relatorioId } = await prepararRelatorio(a, servico);
    await expect(servico.gerarPdf(b.contexto, relatorioId)).rejects.toMatchObject({ status: 404 });
  });

  const chromiumInstalado = existsSync(chromium.executablePath());

  it.skipIf(!chromiumInstalado)('gera um PDF real pela rota, com cabeçalhos de exibição', async () => {
    const cenario = await criarCenario(ambiente, 'pdf-real');
    const { relatorioId } = await prepararRelatorio(cenario);
    const resposta = await buscar(cenario.cookie, `/v1/relatorios/${relatorioId}?formato=pdf`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('application/pdf');
    expect(resposta.headers['content-disposition']).toBe(`inline; filename="relatorio-${relatorioId}.pdf"`);
    expect(resposta.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 120_000);
});
