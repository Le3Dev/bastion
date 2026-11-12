import { describe, expect, it } from 'vitest';
import {
  caminhosExcluidosPadrao,
  etapasDoPerfil,
  metodosDoPerfil,
  perfilDisponivelNoMvp,
  perfilEhAtivo,
  tempoMaximoDeExecucaoMs,
  tetoDeRequisicoes,
} from './PerfilDeAvaliacao';

describe('PerfilDeAvaliacao', () => {
  it('todos os perfis conhecidos estão disponíveis', () => {
    expect(perfilDisponivelNoMvp('PASSIVO')).toBe(true);
    expect(perfilDisponivelNoMvp('PADRAO')).toBe(true);
    expect(perfilDisponivelNoMvp('COMPLETO')).toBe(true);
    expect(perfilDisponivelNoMvp('IA')).toBe(true);
  });

  it('só o passivo não é ativo', () => {
    expect(perfilEhAtivo('PASSIVO')).toBe(false);
    expect(perfilEhAtivo('PADRAO')).toBe(true);
    expect(perfilEhAtivo('COMPLETO')).toBe(true);
    expect(perfilEhAtivo('IA')).toBe(true);
  });

  it('tempo máximo por perfil', () => {
    expect(tempoMaximoDeExecucaoMs('PASSIVO')).toBe(10 * 60_000);
    expect(tempoMaximoDeExecucaoMs('PADRAO')).toBe(30 * 60_000);
    expect(tempoMaximoDeExecucaoMs('COMPLETO')).toBe(60 * 60_000);
    expect(tempoMaximoDeExecucaoMs('IA')).toBe(20 * 60_000);
  });

  it('métodos e teto de requisições por perfil', () => {
    expect(metodosDoPerfil('PASSIVO')).toEqual(['GET', 'HEAD']);
    expect(metodosDoPerfil('PADRAO')).toEqual(['GET', 'HEAD', 'OPTIONS']);
    expect(metodosDoPerfil('COMPLETO')).toEqual(['GET', 'HEAD', 'OPTIONS', 'POST']);
    expect(metodosDoPerfil('IA')).toEqual(['GET', 'HEAD', 'POST']);
    expect(tetoDeRequisicoes('PASSIVO')).toBe(100);
    expect(tetoDeRequisicoes('PADRAO')).toBe(500);
    expect(tetoDeRequisicoes('COMPLETO')).toBe(2000);
    expect(tetoDeRequisicoes('IA')).toBe(100);
  });

  it('caminhos excluídos por padrão', () => {
    expect(caminhosExcluidosPadrao()).toContain('/logout');
    expect(caminhosExcluidosPadrao()).toHaveLength(10);
  });

  it('etapas do passivo', () => {
    expect(etapasDoPerfil('PASSIVO')).toEqual([
      'Conferir propriedade e escopo',
      'Cabeçalhos de segurança',
      'TLS e certificado',
      'Flags de cookies',
      'Exposição de versão',
      'Análise e deduplicação',
    ]);
  });

  it('etapas do padrão, completo e IA', () => {
    const padrao = etapasDoPerfil('PADRAO');
    expect(padrao).toHaveLength(10);
    expect(padrao[5]).toBe('Mapeamento de páginas');
    const completo = etapasDoPerfil('COMPLETO');
    expect(completo).toHaveLength(13);
    expect(completo.slice(-4)).toEqual([
      'Autenticação de teste',
      'Controle de acesso',
      'Injeção (SQL, template, caminho)',
      'Análise e deduplicação',
    ]);
    expect(etapasDoPerfil('IA')).toEqual([
      'Conferir propriedade e escopo',
      'Conector de IA',
      'Integridade do prompt',
      'Vazamento de informação',
      'Segurança da saída',
      'Análise e deduplicação',
    ]);
  });
});
