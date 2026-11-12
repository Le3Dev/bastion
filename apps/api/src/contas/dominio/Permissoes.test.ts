import { describe, expect, it } from 'vitest';
import { PAPEIS, type Papel } from '@bastion/dominio-compartilhado';
import { exigirPermissao, papelPode, PERMISSOES, type Permissao } from './Permissoes';

const ESPERADO: Record<Papel, Permissao[]> = {
  DONO: [...PERMISSOES],
  ADMIN: [...PERMISSOES],
  ANALISTA: [
    'CADASTRAR_SISTEMA',
    'VERIFICAR_SISTEMA',
    'SOLICITAR_AVALIACAO',
    'PARAR_AVALIACAO',
    'TRIAR_ACHADO',
    'CORRIGIR_ACHADO',
    'ACEITAR_RISCO',
    'LER',
  ],
  DESENVOLVEDOR: ['SOLICITAR_AVALIACAO', 'CORRIGIR_ACHADO', 'LER'],
  LEITOR: ['LER'],
};

describe('matriz de permissões', () => {
  for (const papel of PAPEIS) {
    for (const permissao of PERMISSOES) {
      const deveria = ESPERADO[papel].includes(permissao);
      it(`${papel} ${deveria ? 'pode' : 'não pode'} ${permissao}`, () => {
        expect(papelPode(papel, permissao)).toBe(deveria);
      });
    }
  }

  it('exigirPermissao lança PERMISSAO_NEGADA com mensagem clara', () => {
    expect(() => exigirPermissao('LEITOR', 'GERENCIAR_MEMBROS')).toThrow(
      'Seu papel (LEITOR) não permite esta ação.',
    );
    try {
      exigirPermissao('LEITOR', 'GERENCIAR_MEMBROS');
    } catch (erro) {
      expect(erro).toMatchObject({ codigo: 'PERMISSAO_NEGADA' });
    }
  });

  it('exigirPermissao não lança quando o papel pode', () => {
    expect(() => exigirPermissao('ADMIN', 'GERENCIAR_MEMBROS')).not.toThrow();
  });
});
