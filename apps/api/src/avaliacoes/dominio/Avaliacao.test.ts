import { describe, expect, it } from 'vitest';
import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import { Agenda } from './Agenda';
import { Avaliacao } from './Avaliacao';
import { AutorizacaoDeTeste } from './AutorizacaoDeTeste';
import {
  ESTADOS_DA_AVALIACAO,
  TRANSICOES_DA_AVALIACAO,
  ehEstadoFinalDaAvaliacao,
  podeTransicionar,
  type EstadoDaAvaliacao,
} from './EstadoDaAvaliacao';
import type { PerfilDeAvaliacao } from './PerfilDeAvaliacao';

const T0 = new Date('2026-01-01T10:00:00Z');
const minutosDepois = (minutos: number): Date => new Date(T0.getTime() + minutos * 60_000);

const criar = (verificado = true, perfil: PerfilDeAvaliacao = 'PASSIVO'): Avaliacao =>
  Avaliacao.solicitar(
    {
      id: 'av-1',
      organizacaoId: 'org-1',
      sistemaId: 'sis-1',
      perfil,
      agenda: Agenda.unica(),
      notaMinima: 70,
      origem: 'WEB',
      solicitadaPor: 'ana@loja.com',
      sistemaVerificado: verificado,
    },
    T0,
  );

/** Leva a avaliação ao estado desejado pelo caminho normal. */
const levarAte = (alvo: EstadoDaAvaliacao): Avaliacao => {
  const a = criar(alvo !== 'AGUARDANDO_VERIFICACAO');
  if (alvo === 'AGUARDANDO_VERIFICACAO' || alvo === 'NA_FILA') return a;
  a.iniciarPreparacao(T0);
  if (alvo === 'PREPARANDO') return a;
  a.iniciarExecucao(T0);
  if (alvo === 'EM_EXECUCAO') return a;
  a.iniciarAnalise(T0);
  if (alvo === 'ANALISANDO') return a;
  if (alvo === 'CONCLUIDA') a.concluir(90, T0);
  else if (alvo === 'FALHOU') a.falhar('erro', T0);
  else a.cancelar(T0, 'ana');
  return a;
};

const codigoDoErro = (acao: () => void): string | undefined => {
  try {
    acao();
  } catch (erro) {
    return erro instanceof ErroDeDominio ? erro.codigo : 'OUTRO';
  }
  return undefined;
};

describe('EstadoDaAvaliacao', () => {
  it.each([
    ['RASCUNHO', 'AGUARDANDO_VERIFICACAO'],
    ['RASCUNHO', 'NA_FILA'],
    ['AGUARDANDO_VERIFICACAO', 'NA_FILA'],
    ['NA_FILA', 'PREPARANDO'],
    ['PREPARANDO', 'EM_EXECUCAO'],
    ['EM_EXECUCAO', 'ANALISANDO'],
    ['ANALISANDO', 'CONCLUIDA'],
    ['AGUARDANDO_VERIFICACAO', 'FALHOU'],
    ['PREPARANDO', 'FALHOU'],
    ['EM_EXECUCAO', 'FALHOU'],
    ['ANALISANDO', 'FALHOU'],
  ] as const)('permite %s -> %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(true);
  });

  it.each([
    ['RASCUNHO', 'EM_EXECUCAO'],
    ['NA_FILA', 'CONCLUIDA'],
    ['NA_FILA', 'FALHOU'],
    ['EM_EXECUCAO', 'NA_FILA'],
    ['CONCLUIDA', 'CANCELADA'],
    ['FALHOU', 'NA_FILA'],
    ['CANCELADA', 'RASCUNHO'],
  ] as const)('rejeita %s -> %s', (de, para) => {
    expect(podeTransicionar(de, para)).toBe(false);
  });

  it('CANCELADA é alcançável de todo estado não final', () => {
    for (const estado of ESTADOS_DA_AVALIACAO) {
      expect(podeTransicionar(estado, 'CANCELADA')).toBe(!ehEstadoFinalDaAvaliacao(estado));
    }
  });

  it('estados finais não têm saída', () => {
    for (const estado of ['CONCLUIDA', 'FALHOU', 'CANCELADA'] as const) {
      expect(TRANSICOES_DA_AVALIACAO[estado]).toEqual([]);
    }
  });
});

describe('Avaliacao.solicitar', () => {
  it('vai para NA_FILA com sistema verificado e emite AvaliacaoSolicitada', () => {
    const a = criar(true);
    expect(a.estado).toBe('NA_FILA');
    const eventos = a.puxarEventos();
    expect(eventos.map((e) => e.tipo)).toEqual(['AvaliacaoSolicitada']);
    expect(eventos[0]?.organizacaoId).toBe('org-1');
    expect(a.puxarEventos()).toEqual([]);
  });

  it('vai para AGUARDANDO_VERIFICACAO com sistema não verificado e libera depois', () => {
    const a = criar(false);
    expect(a.estado).toBe('AGUARDANDO_VERIFICACAO');
    a.liberarParaFila(minutosDepois(1));
    expect(a.estado).toBe('NA_FILA');
  });

  it('perfil ativo sem autorização é rejeitado', () => {
    expect(codigoDoErro(() => criar(true, 'PADRAO'))).toBe('AUTORIZACAO_OBRIGATORIA');
    expect(codigoDoErro(() => criar(true, 'COMPLETO'))).toBe('AUTORIZACAO_OBRIGATORIA');
    expect(codigoDoErro(() => criar(true, 'IA'))).toBe('AUTORIZACAO_OBRIGATORIA');
  });

  it('perfil ativo com autorização é aceito e guarda o consentimento', () => {
    const a = Avaliacao.solicitar(
      {
        id: 'av-2',
        organizacaoId: 'org-1',
        sistemaId: 'sis-1',
        perfil: 'COMPLETO',
        agenda: Agenda.unica(),
        notaMinima: 70,
        origem: 'WEB',
        solicitadaPor: 'ana@loja.com',
        sistemaVerificado: true,
        autorizacao: AutorizacaoDeTeste.criar({ responsavel: 'Ana', referencia: 'Contrato 42' }, T0),
        permitirCriacaoDeDados: true,
      },
      T0,
    );
    expect(a.estado).toBe('NA_FILA');
    expect(a.autorizacao?.responsavel).toBe('Ana');
    expect(a.permitirCriacaoDeDados).toBe(true);
    const dados = a.paraDados();
    expect(dados.autorizacao?.referencia).toBe('Contrato 42');
    expect(Avaliacao.reconstituir(dados).autorizacao?.referencia).toBe('Contrato 42');
  });

  it('passivo dispensa autorização', () => {
    expect(criar(true, 'PASSIVO').autorizacao).toBeNull();
  });

  it('autorização exige responsável e referência', () => {
    expect(codigoDoErro(() => AutorizacaoDeTeste.criar({ responsavel: ' ', referencia: 'x' }, T0))).toBe(
      'AUTORIZACAO_INCOMPLETA',
    );
  });

  it('rejeita agenda recorrente e nota mínima inválida', () => {
    const base = {
      id: 'x',
      organizacaoId: 'o',
      sistemaId: 's',
      perfil: 'PASSIVO',
      origem: 'API',
      solicitadaPor: 'k',
      sistemaVerificado: true,
    } as const;
    expect(
      codigoDoErro(() =>
        Avaliacao.solicitar({ ...base, agenda: Agenda.recorrente('DIARIA'), notaMinima: 70 }, T0),
      ),
    ).toBe('AGENDAMENTO_INDISPONIVEL');
    expect(
      codigoDoErro(() => Avaliacao.solicitar({ ...base, agenda: Agenda.unica(), notaMinima: 101 }, T0)),
    ).toBe('NOTA_MINIMA_INVALIDA');
    expect(
      codigoDoErro(() => Avaliacao.solicitar({ ...base, agenda: Agenda.unica(), notaMinima: 70.5 }, T0)),
    ).toBe('NOTA_MINIMA_INVALIDA');
  });

  it('cria as 6 etapas do perfil passivo', () => {
    expect(criar().paraDados().etapas.map((e) => e.nome)).toHaveLength(6);
  });
});

describe('Avaliacao: ciclo de vida', () => {
  it('percorre o caminho feliz e emite AvaliacaoConcluida', () => {
    const a = criar();
    a.puxarEventos();
    a.iniciarPreparacao(minutosDepois(1));
    a.iniciarExecucao(minutosDepois(2));
    a.iniciarAnalise(minutosDepois(3));
    a.concluir(85, minutosDepois(4));
    expect(a.estado).toBe('CONCLUIDA');
    expect(a.nota).toBe(85);
    expect(a.aprovada).toBe(true);
    expect(a.progresso).toBe(100);
    const [evento] = a.puxarEventos();
    expect(evento?.tipo).toBe('AvaliacaoConcluida');
    expect(evento?.dados).toMatchObject({ nota: 85, aprovada: true });
    const dados = a.paraDados();
    expect(dados.iniciadaEm).toEqual(minutosDepois(2));
    expect(dados.concluidaEm).toEqual(minutosDepois(4));
  });

  it('reprova quando a nota é menor que a mínima', () => {
    const a = levarAte('ANALISANDO');
    a.concluir(69, T0);
    expect(a.aprovada).toBe(false);
  });

  it('aprovada é null antes de concluir', () => {
    expect(criar().aprovada).toBeNull();
  });

  it('falhar emite AvaliacaoFalhou com motivo', () => {
    const a = levarAte('EM_EXECUCAO');
    a.puxarEventos();
    a.falhar('Alvo fora do ar', minutosDepois(1));
    expect(a.estado).toBe('FALHOU');
    const [evento] = a.puxarEventos();
    expect(evento?.tipo).toBe('AvaliacaoFalhou');
    expect(evento?.dados).toMatchObject({ motivo: 'Alvo fora do ar' });
  });

  it.each(['AGUARDANDO_VERIFICACAO', 'NA_FILA', 'PREPARANDO', 'EM_EXECUCAO', 'ANALISANDO'] as const)(
    'cancela a partir de %s e emite AvaliacaoCancelada',
    (estado) => {
      const a = levarAte(estado);
      a.puxarEventos();
      a.cancelar(minutosDepois(1), 'ana');
      expect(a.estado).toBe('CANCELADA');
      const [evento] = a.puxarEventos();
      expect(evento?.tipo).toBe('AvaliacaoCancelada');
      expect(evento?.dados).toMatchObject({ por: 'ana' });
    },
  );

  it('transição inválida lança TRANSICAO_INVALIDA com mensagem clara', () => {
    const a = criar();
    try {
      a.iniciarExecucao(T0);
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeDominio);
      expect((erro as ErroDeDominio).codigo).toBe('TRANSICAO_INVALIDA');
      expect((erro as ErroDeDominio).message).toBe(
        'Não é possível passar a avaliação de NA_FILA para EM_EXECUCAO',
      );
    }
  });

  it('estados finais rejeitam qualquer mudança', () => {
    for (const final of ['CONCLUIDA', 'FALHOU', 'CANCELADA'] as const) {
      expect(codigoDoErro(() => levarAte(final).cancelar(T0, 'x'))).toBe('TRANSICAO_INVALIDA');
    }
    expect(codigoDoErro(() => criar().concluir(90, T0))).toBe('TRANSICAO_INVALIDA');
  });

  it('rejeita nota fora de 0 a 100', () => {
    expect(codigoDoErro(() => levarAte('ANALISANDO').concluir(101, T0))).toBe('NOTA_INVALIDA');
  });
});

describe('Avaliacao: etapas e progresso', () => {
  it('calcula progresso como média das etapas', () => {
    const a = criar();
    a.atualizarEtapa('Cabeçalhos de segurança', 'CONCLUIDA', 100);
    a.atualizarEtapa('TLS e certificado', 'EM_EXECUCAO', 50);
    expect(a.progresso).toBe(25);
  });

  it('rejeita etapa desconhecida e progresso inválido', () => {
    const a = criar();
    expect(codigoDoErro(() => a.atualizarEtapa('Inexistente', 'CONCLUIDA', 10))).toBe('ETAPA_NAO_ENCONTRADA');
    expect(codigoDoErro(() => a.atualizarEtapa('TLS e certificado', 'CONCLUIDA', 120))).toBe(
      'PROGRESSO_INVALIDO',
    );
  });
});

describe('Avaliacao.verificarTempoLimite', () => {
  it('falha PREPARANDO após 20 minutos, não antes', () => {
    const a = levarAte('PREPARANDO');
    expect(a.verificarTempoLimite(minutosDepois(20))).toBe(false);
    expect(a.estado).toBe('PREPARANDO');
    expect(a.verificarTempoLimite(minutosDepois(21))).toBe(true);
    expect(a.estado).toBe('FALHOU');
  });

  it('falha EM_EXECUCAO após o tempo máximo do perfil (10 min no passivo)', () => {
    const a = levarAte('EM_EXECUCAO');
    expect(a.verificarTempoLimite(minutosDepois(10))).toBe(false);
    expect(a.verificarTempoLimite(minutosDepois(11))).toBe(true);
    expect(a.estado).toBe('FALHOU');
  });

  it('ignora estados sem limite', () => {
    const a = levarAte('NA_FILA');
    expect(a.verificarTempoLimite(minutosDepois(999))).toBe(false);
  });
});

describe('Avaliacao: persistência', () => {
  it('reconstitui a partir dos dados sem perder estado', () => {
    const a = levarAte('EM_EXECUCAO');
    a.atualizarEtapa('TLS e certificado', 'EM_EXECUCAO', 30);
    const dados = a.paraDados();
    const copia = Avaliacao.reconstituir(dados);
    expect(copia.paraDados()).toEqual(dados);
    expect(copia.puxarEventos()).toEqual([]);
  });
});
