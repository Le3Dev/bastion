import { describe, expect, it } from 'vitest';
import { ConsultaPaginada, CorpoDeMudancaDeEstado, EventoDeResultado, chaveDeCancelamento } from './index';

describe('CorpoDeMudancaDeEstado', () => {
  it('exige riscoAceito ao aceitar o risco', () => {
    expect(CorpoDeMudancaDeEstado.safeParse({ estado: 'RISCO_ACEITO' }).success).toBe(false);
  });

  it('aceita risco com justificativa longa', () => {
    const resultado = CorpoDeMudancaDeEstado.safeParse({
      estado: 'RISCO_ACEITO',
      riscoAceito: {
        justificativa: 'Sistema legado em desativação em dois meses.',
        responsavel: 'Ana',
        validoAte: '2030-01-01T00:00:00Z',
      },
    });
    expect(resultado.success).toBe(true);
  });

  it('rejeita justificativa curta', () => {
    const resultado = CorpoDeMudancaDeEstado.safeParse({
      estado: 'RISCO_ACEITO',
      riscoAceito: { justificativa: 'curta', responsavel: 'Ana', validoAte: '2030-01-01T00:00:00Z' },
    });
    expect(resultado.success).toBe(false);
  });

  it('não exige riscoAceito para outros estados', () => {
    expect(CorpoDeMudancaDeEstado.safeParse({ estado: 'CONFIRMADO' }).success).toBe(true);
  });
});

describe('EventoDeResultado', () => {
  const base = {
    idDoEvento: '3f8e6c1e-5d1a-4c52-9a43-0a6f1d0b7c11',
    organizacaoId: '0b9d1c3e-6a7f-4f5c-8c1d-2f4a6b8c0d12',
    em: '2026-01-01T10:00:00Z',
  };
  const avaliacaoId = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('valida evento de etapa', () => {
    const r = EventoDeResultado.safeParse({
      ...base,
      avaliacaoId,
      tipo: 'etapa-atualizada',
      nome: 'TLS e certificado',
      estado: 'EM_EXECUCAO',
      progresso: 40,
    });
    expect(r.success).toBe(true);
  });

  it('entrega-concluida não exige avaliacaoId', () => {
    const r = EventoDeResultado.safeParse({
      ...base,
      tipo: 'entrega-concluida',
      entregaId: avaliacaoId,
      sucesso: true,
      status: 200,
      mensagem: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita tipo desconhecido e evento de avaliação sem avaliacaoId', () => {
    expect(EventoDeResultado.safeParse({ ...base, tipo: 'inexistente' }).success).toBe(false);
    expect(EventoDeResultado.safeParse({ ...base, tipo: 'avaliacao-finalizada' }).success).toBe(false);
  });
});

describe('ConsultaPaginada e filas', () => {
  it('aplica limite padrão 20 e converte texto', () => {
    expect(ConsultaPaginada.parse({}).limite).toBe(20);
    expect(ConsultaPaginada.parse({ limite: '50' }).limite).toBe(50);
    expect(ConsultaPaginada.safeParse({ limite: '101' }).success).toBe(false);
  });

  it('monta a chave de cancelamento', () => {
    expect(chaveDeCancelamento('abc')).toBe('bastion:cancelamento:abc');
  });
});
