import type { RelatorioDto } from '@bastion/contratos';
import { describe, expect, it } from 'vitest';
import { escaparHtml, renderizarHtml } from './modelo-html';

const ID = '3f2b8c1e-5a4d-4c7e-9b1a-0d6e8f2a4c10';

const relatorio = (sobrescrever: Partial<RelatorioDto> = {}): RelatorioDto => ({
  id: ID,
  avaliacaoId: ID,
  sistemaId: ID,
  sistemaNome: 'Portal <b>do Cliente</b>',
  perfil: 'PASSIVO',
  geradoEm: '2026-05-10T15:30:00.000Z',
  nota: 72,
  notaMinima: 70,
  aprovado: true,
  resumo: 'O sistema recebeu nota 72.',
  escopo: {
    urlDeHomologacao: 'https://homologacao.cliente.test',
    dominioDeProducao: 'producao.cliente.test',
    requisicoesPermitidas: 14,
    requisicoesBloqueadas: 2,
  },
  contagemPorSeveridade: { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 0 },
  conformidade: {
    owasp: [{ codigo: 'A05:2021', quantidade: 3 }],
    lgpd: [{ codigo: 'Art. 46', quantidade: 1 }],
  },
  achados: [
    {
      id: ID,
      sistemaId: ID,
      sistemaNome: 'Portal',
      titulo: 'Cabeçalho CSP ausente <script>alert(1)</script>',
      tipo: 'CABECALHO_CSP_AUSENTE',
      severidade: 'ALTA',
      estado: 'NOVO',
      local: '/login',
      ocorrencias: 1,
      ultimaVezEm: '2026-05-10T15:30:00.000Z',
    },
  ],
  ...sobrescrever,
});

describe('escaparHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escaparHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('mantém texto comum intacto', () => {
    expect(escaparHtml('Configuração segura')).toBe('Configuração segura');
  });
});

describe('renderizarHtml', () => {
  const html = renderizarHtml(relatorio(), {
    [ID]: { descricao: 'A política de segurança de conteúdo não foi enviada.', correcaoSugerida: 'Envie o cabeçalho CSP.' },
  });

  it('mostra nota, situação, achados e correção sugerida', () => {
    expect(html).toContain('72<small>/100</small>');
    expect(html).toContain('Aprovado');
    expect(html).toContain('Nota mínima exigida: 70');
    expect(html).toContain('/login');
    expect(html).toContain('Envie o cabeçalho CSP.');
    expect(html).toContain('A05:2021');
    expect(html).toContain('Art. 46');
  });

  it('marca a avaliação reprovada', () => {
    expect(renderizarHtml(relatorio({ aprovado: false, nota: 40 }))).toContain('Reprovado');
  });

  it('escapa o texto vindo dos dados', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>do Cliente</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('é autocontido: sem recursos externos, gradientes ou emojis', () => {
    expect(html).not.toMatch(/(src|href)\s*=/i);
    expect(html).not.toMatch(/<link|<script|<img|<iframe/i);
    expect(html).not.toMatch(/url\(|@import|gradient/i);
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('define as cores em hexadecimal apenas no :root', () => {
    const [, depoisDoRoot] = html.split(':root {');
    const [raiz, resto] = (depoisDoRoot ?? '').split('}\n');
    expect(raiz).toMatch(/#[0-9A-F]{6}/);
    expect(resto).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
  });
});
