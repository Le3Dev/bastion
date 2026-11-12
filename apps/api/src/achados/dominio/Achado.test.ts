import { describe, expect, it } from 'vitest';
import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import { Achado } from './Achado';
import type { DadosDaConstatacao } from './DadosDaConstatacao';
import {
  ESTADOS_DO_ACHADO,
  estaEmAberto,
  podeTransicionarAchado,
  transicoesPossiveis,
  type EstadoDoAchado,
} from './EstadoDoAchado';
import { Evidencia, LIMITE_DA_EVIDENCIA_EM_BYTES } from './Evidencia';
import { RiscoAceito } from './RiscoAceito';
import { ServicoDeDeduplicacao } from './ServicoDeDeduplicacao';

const T0 = new Date('2026-01-01T10:00:00Z');
const diasDepois = (dias: number): Date => new Date(T0.getTime() + dias * 86_400_000);

const constatacao = (sobrescrita: Partial<DadosDaConstatacao> = {}): DadosDaConstatacao => ({
  tipo: 'CABECALHO_CSP_AUSENTE',
  titulo: 'CSP ausente',
  severidade: 'MEDIA',
  local: 'https://loja.com/',
  descricao: 'Sem Content-Security-Policy',
  evidencia: { requisicao: 'GET /', resposta: '200', observacao: 'sem csp' },
  correcaoSugerida: 'Adicione o cabeçalho',
  conformidade: { owasp: ['A05:2021'], lgpd: ['Art. 46'] },
  ...sobrescrita,
});

const detectar = (sobrescrita: Partial<DadosDaConstatacao> = {}, id = 'ach-1'): Achado =>
  Achado.detectar(
    { id, organizacaoId: 'org-1', sistemaId: 'sis-1', avaliacaoId: 'av-1', constatacao: constatacao(sobrescrita) },
    T0,
  );

const risco = (): RiscoAceito =>
  RiscoAceito.criar(
    { justificativa: 'Sistema legado será desativado em breve', responsavel: 'Ana', validoAte: diasDepois(30) },
    T0,
  );

const levarAte = (alvo: EstadoDoAchado): Achado => {
  const a = detectar();
  switch (alvo) {
    case 'NOVO':
      return a;
    case 'RISCO_ACEITO':
      a.aceitarRisco(risco(), 'ana', null, T0);
      return a;
    case 'CONFIRMADO':
      a.confirmar('ana', null, T0);
      return a;
    case 'EM_CORRECAO':
      a.confirmar('ana', null, T0);
      a.iniciarCorrecao('ana', null, T0);
      return a;
    case 'REVALIDANDO':
      a.confirmar('ana', null, T0);
      a.iniciarCorrecao('ana', null, T0);
      a.solicitarRevalidacao('ana', null, T0);
      return a;
    case 'CORRIGIDO':
      a.confirmar('ana', null, T0);
      a.iniciarCorrecao('ana', null, T0);
      a.solicitarRevalidacao('ana', null, T0);
      a.concluirRevalidacao(false, 'ana', T0);
      return a;
    case 'REABERTO':
      a.confirmar('ana', null, T0);
      a.iniciarCorrecao('ana', null, T0);
      a.solicitarRevalidacao('ana', null, T0);
      a.concluirRevalidacao(true, 'ana', T0);
      return a;
  }
};

const codigoDoErro = (acao: () => void): string | undefined => {
  try {
    acao();
  } catch (erro) {
    return erro instanceof ErroDeDominio ? erro.codigo : 'OUTRO';
  }
  return undefined;
};

describe('EstadoDoAchado', () => {
  const permitidas: Record<EstadoDoAchado, EstadoDoAchado[]> = {
    NOVO: ['CONFIRMADO', 'RISCO_ACEITO'],
    CONFIRMADO: ['EM_CORRECAO', 'RISCO_ACEITO'],
    EM_CORRECAO: ['REVALIDANDO'],
    REVALIDANDO: ['CORRIGIDO', 'REABERTO'],
    REABERTO: ['EM_CORRECAO', 'RISCO_ACEITO'],
    RISCO_ACEITO: ['CONFIRMADO'],
    CORRIGIDO: ['REABERTO'],
  };

  it('aceita exatamente as transições definidas', () => {
    for (const de of ESTADOS_DO_ACHADO) {
      for (const para of ESTADOS_DO_ACHADO) {
        expect(podeTransicionarAchado(de, para), `${de} -> ${para}`).toBe(permitidas[de].includes(para));
      }
      expect(transicoesPossiveis(de)).toEqual(permitidas[de]);
    }
  });

  it('estaEmAberto é falso só para CORRIGIDO e RISCO_ACEITO', () => {
    expect(ESTADOS_DO_ACHADO.filter((e) => !estaEmAberto(e))).toEqual(['CORRIGIDO', 'RISCO_ACEITO']);
  });
});

describe('Achado.detectar', () => {
  it('nasce NOVO com impressão digital, ocorrência 1 e evento AchadoCriado', () => {
    const a = detectar({ local: 'https://Loja.com/Login/' });
    const dados = a.paraDados();
    expect(a.estado).toBe('NOVO');
    expect(dados.impressaoDigital).toBe('sis-1:CABECALHO_CSP_AUSENTE:https://loja.com/login');
    expect(dados.ocorrencias).toBe(1);
    expect(dados.avaliacaoIds).toEqual(['av-1']);
    expect(dados.historico).toHaveLength(1);
    expect(a.puxarEventos().map((e) => e.tipo)).toEqual(['AchadoCriado']);
    expect(a.puxarEventos()).toEqual([]);
  });

  it('reconstitui sem perder dados', () => {
    const a = levarAte('RISCO_ACEITO');
    const dados = a.paraDados();
    expect(Achado.reconstituir(dados).paraDados()).toEqual(dados);
  });
});

describe('Achado: transições', () => {
  it('percorre o caminho NOVO até CORRIGIDO e emite AchadoCorrigido', () => {
    const a = levarAte('REVALIDANDO');
    a.puxarEventos();
    a.concluirRevalidacao(false, 'ana', T0);
    expect(a.estado).toBe('CORRIGIDO');
    expect(a.puxarEventos().map((e) => e.tipo)).toEqual(['AchadoCorrigido']);
    expect(a.paraDados().historico.map((h) => h.para)).toEqual([
      'NOVO',
      'CONFIRMADO',
      'EM_CORRECAO',
      'REVALIDANDO',
      'CORRIGIDO',
    ]);
  });

  it('revalidação que reencontra o problema reabre e emite AchadoReaberto', () => {
    const a = levarAte('REVALIDANDO');
    a.puxarEventos();
    a.concluirRevalidacao(true, 'ana', T0);
    expect(a.estado).toBe('REABERTO');
    expect(a.puxarEventos().map((e) => e.tipo)).toEqual(['AchadoReaberto']);
  });

  it('percorre REABERTO -> EM_CORRECAO e CORRIGIDO -> REABERTO', () => {
    const a = levarAte('REABERTO');
    a.iniciarCorrecao('ana', null, T0);
    expect(a.estado).toBe('EM_CORRECAO');
    const b = levarAte('CORRIGIDO');
    b.reabrir('ana', 'voltou', T0);
    expect(b.estado).toBe('REABERTO');
  });

  it('aceitar risco a partir de NOVO, CONFIRMADO e REABERTO; sair volta a CONFIRMADO', () => {
    for (const origem of ['NOVO', 'CONFIRMADO', 'REABERTO'] as const) {
      const a = levarAte(origem);
      a.aceitarRisco(risco(), 'ana', 'ok', T0);
      expect(a.estado).toBe('RISCO_ACEITO');
      expect(a.riscoAceito).not.toBeNull();
      a.confirmar('ana', null, T0);
      expect(a.estado).toBe('CONFIRMADO');
      expect(a.riscoAceito).toBeNull();
    }
  });

  it('rejeita transições inválidas com TRANSICAO_INVALIDA', () => {
    expect(codigoDoErro(() => levarAte('NOVO').iniciarCorrecao('a', null, T0))).toBe('TRANSICAO_INVALIDA');
    expect(codigoDoErro(() => levarAte('CONFIRMADO').solicitarRevalidacao('a', null, T0))).toBe(
      'TRANSICAO_INVALIDA',
    );
    expect(codigoDoErro(() => levarAte('CORRIGIDO').confirmar('a', null, T0))).toBe('TRANSICAO_INVALIDA');
    expect(codigoDoErro(() => levarAte('NOVO').concluirRevalidacao(false, 'a', T0))).toBe('TRANSICAO_INVALIDA');
    expect(codigoDoErro(() => levarAte('CONFIRMADO').mudarEstado('NOVO', { ator: 'a' }, T0))).toBe(
      'TRANSICAO_INVALIDA',
    );
  });

  it('mudarEstado despacha para o método certo e valida', () => {
    const a = detectar();
    a.mudarEstado('CONFIRMADO', { ator: 'ana', comentario: 'reproduzi' }, T0);
    a.mudarEstado('EM_CORRECAO', { ator: 'ana' }, T0);
    a.mudarEstado('REVALIDANDO', { ator: 'ana' }, T0);
    a.mudarEstado('CORRIGIDO', { ator: 'ana' }, T0);
    expect(a.estado).toBe('CORRIGIDO');
    expect(a.paraDados().historico[1]?.comentario).toBe('reproduzi');
    expect(codigoDoErro(() => a.mudarEstado('EM_CORRECAO', { ator: 'ana' }, T0))).toBe('TRANSICAO_INVALIDA');
  });

  it('mudarEstado para RISCO_ACEITO exige o risco', () => {
    const a = detectar();
    expect(codigoDoErro(() => a.mudarEstado('RISCO_ACEITO', { ator: 'ana' }, T0))).toBe(
      'RISCO_ACEITO_OBRIGATORIO',
    );
    a.mudarEstado('RISCO_ACEITO', { ator: 'ana', riscoAceito: risco() }, T0);
    expect(a.estado).toBe('RISCO_ACEITO');
  });
});

describe('RiscoAceito', () => {
  const base = { justificativa: 'Justificativa com mais de vinte caracteres', responsavel: 'Ana' };

  it('cria com dados válidos', () => {
    expect(RiscoAceito.criar({ ...base, validoAte: diasDepois(1) }, T0).responsavel).toBe('Ana');
  });

  it('exige justificativa de 20 caracteres, responsável e validade futura', () => {
    expect(codigoDoErro(() => RiscoAceito.criar({ ...base, justificativa: 'curta', validoAte: diasDepois(1) }, T0))).toBe(
      'JUSTIFICATIVA_CURTA',
    );
    expect(codigoDoErro(() => RiscoAceito.criar({ ...base, responsavel: '  ', validoAte: diasDepois(1) }, T0))).toBe(
      'RESPONSAVEL_OBRIGATORIO',
    );
    expect(codigoDoErro(() => RiscoAceito.criar({ ...base, validoAte: T0 }, T0))).toBe('VALIDADE_INVALIDA');
    expect(codigoDoErro(() => RiscoAceito.criar({ ...base, validoAte: diasDepois(-1) }, T0))).toBe(
      'VALIDADE_INVALIDA',
    );
  });

  it('venceuEm é verdadeiro a partir da data de validade', () => {
    const r = RiscoAceito.criar({ ...base, validoAte: diasDepois(10) }, T0);
    expect(r.venceuEm(diasDepois(9))).toBe(false);
    expect(r.venceuEm(diasDepois(10))).toBe(true);
  });
});

describe('Achado.verificarVencimentoDoRisco', () => {
  it('volta para CONFIRMADO com ator Sistema quando vence', () => {
    const a = levarAte('RISCO_ACEITO');
    expect(a.verificarVencimentoDoRisco(diasDepois(29))).toBe(false);
    expect(a.estado).toBe('RISCO_ACEITO');
    expect(a.verificarVencimentoDoRisco(diasDepois(31))).toBe(true);
    expect(a.estado).toBe('CONFIRMADO');
    const ultima = a.paraDados().historico.at(-1);
    expect(ultima?.ator).toBe('Sistema');
    expect(ultima?.para).toBe('CONFIRMADO');
  });

  it('não faz nada fora de RISCO_ACEITO', () => {
    expect(levarAte('CONFIRMADO').verificarVencimentoDoRisco(diasDepois(999))).toBe(false);
  });
});

describe('Achado.registrarNovaOcorrencia', () => {
  it('soma ocorrências e atualiza ultimaVezEm', () => {
    const a = levarAte('CONFIRMADO');
    a.registrarNovaOcorrencia('av-2', diasDepois(1));
    const dados = a.paraDados();
    expect(dados.ocorrencias).toBe(2);
    expect(dados.ultimaVezEm).toEqual(diasDepois(1));
    expect(dados.avaliacaoIds).toEqual(['av-1', 'av-2']);
    expect(a.estado).toBe('CONFIRMADO');
  });

  it('é idempotente para a mesma avaliação', () => {
    const a = detectar();
    a.registrarNovaOcorrencia('av-1', diasDepois(1));
    a.registrarNovaOcorrencia('av-2', diasDepois(2));
    a.registrarNovaOcorrencia('av-2', diasDepois(3));
    expect(a.ocorrencias).toBe(2);
    expect(a.paraDados().ultimaVezEm).toEqual(diasDepois(2));
  });

  it('reabre achado CORRIGIDO e emite AchadoReaberto', () => {
    const a = levarAte('CORRIGIDO');
    a.puxarEventos();
    a.registrarNovaOcorrencia('av-9', diasDepois(5));
    expect(a.estado).toBe('REABERTO');
    expect(a.puxarEventos().map((e) => e.tipo)).toEqual(['AchadoReaberto']);
    expect(a.paraDados().historico.at(-1)?.ator).toBe('Sistema');
  });
});

describe('Evidencia', () => {
  it('mantém campos pequenos intactos', () => {
    const e = Evidencia.criar({ requisicao: 'a', resposta: 'b', observacao: 'c' });
    expect(e.paraDados()).toEqual({ requisicao: 'a', resposta: 'b', observacao: 'c' });
  });

  it('trunca campos acima de 8 KB e marca [truncado]', () => {
    const e = Evidencia.criar({ requisicao: 'x'.repeat(LIMITE_DA_EVIDENCIA_EM_BYTES + 1), resposta: 'ok', observacao: '' });
    expect(e.requisicao.endsWith('[truncado]')).toBe(true);
    expect(e.requisicao.length).toBeLessThan(LIMITE_DA_EVIDENCIA_EM_BYTES + 20);
    expect(e.resposta).toBe('ok');
  });

  it('não corta caractere multibyte no meio', () => {
    const e = Evidencia.criar({ requisicao: 'é'.repeat(LIMITE_DA_EVIDENCIA_EM_BYTES), resposta: '', observacao: '' });
    expect(e.requisicao).not.toContain('�');
    expect(e.requisicao.endsWith('[truncado]')).toBe(true);
  });
});

describe('ServicoDeDeduplicacao', () => {
  it('separa novas de reincidentes', () => {
    const existente = detectar();
    const mapa = new Map([[existente.impressaoDigital, existente]]);
    const resultado = ServicoDeDeduplicacao.classificar(
      [constatacao(), constatacao({ tipo: 'COOKIE_SEM_SECURE', local: 'sessao' })],
      mapa,
      'sis-1',
    );
    expect(resultado.reincidentes).toHaveLength(1);
    expect(resultado.reincidentes[0]?.achado).toBe(existente);
    expect(resultado.novas.map((n) => n.tipo)).toEqual(['COOKIE_SEM_SECURE']);
  });

  it('agrupa constatações repetidas no mesmo lote e normaliza o local', () => {
    const resultado = ServicoDeDeduplicacao.classificar(
      [constatacao({ local: 'https://loja.com/a/' }), constatacao({ local: 'HTTPS://LOJA.COM/a' })],
      new Map(),
      'sis-1',
    );
    expect(resultado.novas).toHaveLength(1);
  });

  it('não agrupa sistema, tipo ou local diferentes', () => {
    const existente = detectar();
    const mapa = new Map([[existente.impressaoDigital, existente]]);
    const outroSistema = ServicoDeDeduplicacao.classificar([constatacao()], mapa, 'sis-2');
    expect(outroSistema.novas).toHaveLength(1);
    const outroTipo = ServicoDeDeduplicacao.classificar([constatacao({ tipo: 'HTTPS_AUSENTE' })], mapa, 'sis-1');
    expect(outroTipo.novas).toHaveLength(1);
    const outroLocal = ServicoDeDeduplicacao.classificar([constatacao({ local: 'https://loja.com/x' })], mapa, 'sis-1');
    expect(outroLocal.novas).toHaveLength(1);
  });
});
