import { describe, expect, it } from 'vitest';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { Agenda } from '../dominio/Agenda';
import { Avaliacao } from '../dominio/Avaliacao';
import { contagemCompleta, paraAvaliacaoDto } from './paraAvaliacaoDto';
import { origemDaSolicitacao } from './ServicoDeAvaliacoes';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SISTEMA = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ORGANIZACAO = '9b2e6d6a-1f4c-4b8e-8f3a-2d5c7a1e4b90';
const AGORA = new Date('2026-05-01T12:00:00.000Z');

const nova = (sistemaVerificado = true): Avaliacao =>
  Avaliacao.solicitar(
    {
      id: ID,
      organizacaoId: ORGANIZACAO,
      sistemaId: SISTEMA,
      perfil: 'PASSIVO',
      agenda: Agenda.unica(),
      notaMinima: 70,
      origem: 'WEB',
      solicitadaPor: 'Ana',
      sistemaVerificado,
    },
    AGORA,
  );

describe('paraAvaliacaoDto', () => {
  it('monta o DTO de uma avaliação recém-solicitada', () => {
    const dto = paraAvaliacaoDto(nova(), {
      sistemaNome: 'Portal',
      relatorioId: null,
      contagemDeAchados: {},
    });
    expect(dto).toMatchObject({
      id: ID,
      sistemaId: SISTEMA,
      sistemaNome: 'Portal',
      estado: 'NA_FILA',
      progresso: 0,
      nota: null,
      aprovada: null,
      notaMinima: 70,
      solicitadaEm: AGORA.toISOString(),
      iniciadaEm: null,
      concluidaEm: null,
      motivoDaFalha: null,
      relatorioId: null,
      contagemDeAchados: { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 },
    });
    expect(dto.etapas).toHaveLength(6);
    expect(dto.etapas[0]).toEqual({
      ordem: 1,
      nome: 'Conferir propriedade e escopo',
      estado: 'PENDENTE',
      progresso: 0,
    });
  });

  it('avaliação concluída tem progresso 100, nota e aprovação', () => {
    const avaliacao = nova();
    avaliacao.iniciarPreparacao(AGORA);
    avaliacao.iniciarExecucao(AGORA);
    avaliacao.iniciarAnalise(AGORA);
    const fim = new Date('2026-05-01T12:05:00.000Z');
    avaliacao.concluir(85, fim);
    const dto = paraAvaliacaoDto(avaliacao, {
      sistemaNome: 'Portal',
      relatorioId: '1b4e28ba-2fa1-4d3b-a3fb-23a4f4f7c0aa',
      contagemDeAchados: { ALTA: 2 },
    });
    expect(dto).toMatchObject({
      estado: 'CONCLUIDA',
      progresso: 100,
      nota: 85,
      aprovada: true,
      iniciadaEm: AGORA.toISOString(),
      concluidaEm: fim.toISOString(),
      contagemDeAchados: { CRITICA: 0, ALTA: 2, MEDIA: 0, BAIXA: 0 },
    });
  });
});

describe('contagemCompleta', () => {
  it('preenche as severidades ausentes com zero', () => {
    expect(contagemCompleta({ BAIXA: 3 })).toEqual({ CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 3 });
  });
});

describe('origemDaSolicitacao', () => {
  const contexto = (tipo: 'USUARIO' | 'CHAVE_DE_API'): ContextoDaRequisicao => ({
    organizacaoId: ORGANIZACAO,
    papel: 'ANALISTA',
    ator: { tipo, id: 'x', nome: 'Ator' },
    membroId: null,
  });

  it('sessão (usuário) é sempre WEB', () => {
    expect(origemDaSolicitacao(contexto('USUARIO'), 'CI')).toBe('WEB');
  });
  it('chave de API é API, ou CI quando o cabeçalho X-Bastion-Origem é CI', () => {
    expect(origemDaSolicitacao(contexto('CHAVE_DE_API'), undefined)).toBe('API');
    expect(origemDaSolicitacao(contexto('CHAVE_DE_API'), 'outra')).toBe('API');
    expect(origemDaSolicitacao(contexto('CHAVE_DE_API'), 'CI')).toBe('CI');
    expect(origemDaSolicitacao(contexto('CHAVE_DE_API'), ' ci ')).toBe('CI');
  });
});
