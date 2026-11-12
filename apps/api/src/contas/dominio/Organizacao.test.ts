import { describe, expect, it } from 'vitest';
import { Organizacao } from './Organizacao';

const AGORA = new Date('2026-01-10T12:00:00Z');

const fundar = (): Organizacao =>
  Organizacao.fundar(
    {
      id: 'org-1',
      nome: 'Loja Exemplo',
      dono: { membroId: 'm-dono', usuarioId: 'u-dono', nome: 'Dona', email: 'dona@loja.com.br' },
    },
    AGORA,
  );

const comAdmin = (): Organizacao => {
  const org = fundar();
  org.convidarMembro({ membroId: 'm-admin', email: 'admin@loja.com.br', papel: 'ADMIN' }, 'DONO', AGORA);
  org.aceitarConvite('m-admin', 'u-admin', 'Admin', AGORA);
  return org;
};

const codigoDe = (fn: () => void): unknown => {
  try {
    fn();
  } catch (erro) {
    return (erro as { codigo?: unknown }).codigo;
  }
  return undefined;
};

describe('Organizacao', () => {
  it('nasce com o DONO ativo e emite OrganizacaoFundada', () => {
    const org = fundar();
    const dono = org.membroPorUsuario('u-dono');
    expect(dono?.papel).toBe('DONO');
    expect(dono?.estado).toBe('ATIVO');
    expect(org.puxarEventos().map((e) => e.tipo)).toEqual(['OrganizacaoFundada']);
    expect(org.puxarEventos()).toEqual([]);
  });

  it('convida membro e emite MembroConvidado', () => {
    const org = fundar();
    org.puxarEventos();
    const membro = org.convidarMembro(
      { membroId: 'm-2', email: 'ana@loja.com.br', papel: 'ANALISTA' },
      'ADMIN',
      AGORA,
    );
    expect(membro.estado).toBe('CONVIDADO');
    expect(org.puxarEventos().map((e) => e.tipo)).toEqual(['MembroConvidado']);
  });

  it('exige GERENCIAR_MEMBROS para convidar', () => {
    expect(
      codigoDe(() =>
        fundar().convidarMembro({ membroId: 'm', email: 'a@b.com', papel: 'LEITOR' }, 'ANALISTA', AGORA),
      ),
    ).toBe('PERMISSAO_NEGADA');
  });

  it('impede e-mail duplicado', () => {
    expect(
      codigoDe(() =>
        fundar().convidarMembro(
          { membroId: 'm', email: 'DONA@loja.com.br', papel: 'LEITOR' },
          'DONO',
          AGORA,
        ),
      ),
    ).toBe('MEMBRO_DUPLICADO');
  });

  it('não permite convidar como DONO', () => {
    expect(
      codigoDe(() =>
        fundar().convidarMembro({ membroId: 'm', email: 'x@loja.com.br', papel: 'DONO' }, 'DONO', AGORA),
      ),
    ).toBe('CONVITE_COMO_DONO');
  });

  it('aceita convite uma única vez', () => {
    const org = comAdmin();
    expect(org.membroPorUsuario('u-admin')?.estado).toBe('ATIVO');
    expect(codigoDe(() => org.aceitarConvite('m-admin', 'u-admin', 'Admin', AGORA))).toBe(
      'CONVITE_JA_ACEITO',
    );
  });

  it('falha ao aceitar convite de membro inexistente', () => {
    expect(codigoDe(() => fundar().aceitarConvite('nao-existe', 'u', 'N', AGORA))).toBe(
      'MEMBRO_NAO_ENCONTRADO',
    );
  });

  it('altera o papel de um membro', () => {
    const org = fundar();
    org.convidarMembro({ membroId: 'm-2', email: 'ana@loja.com.br', papel: 'LEITOR' }, 'DONO', AGORA);
    org.alterarPapel('m-2', 'ANALISTA', 'ADMIN');
    expect(org.membroPorId('m-2')?.papel).toBe('ANALISTA');
  });

  it('ninguém altera o DONO nem promove a DONO', () => {
    const org = comAdmin();
    expect(codigoDe(() => org.alterarPapel('m-dono', 'ADMIN', 'DONO'))).toBe('DONO_IMUTAVEL');
    expect(codigoDe(() => org.alterarPapel('m-admin', 'DONO', 'DONO'))).toBe('PROMOCAO_A_DONO');
  });

  it('ADMIN não altera outro ADMIN, mas o DONO altera', () => {
    const org = comAdmin();
    expect(codigoDe(() => org.alterarPapel('m-admin', 'LEITOR', 'ADMIN'))).toBe(
      'ALTERACAO_DE_ADMIN_NEGADA',
    );
    org.alterarPapel('m-admin', 'LEITOR', 'DONO');
    expect(org.membroPorId('m-admin')?.papel).toBe('LEITOR');
  });

  it('exige permissão para alterar papel', () => {
    expect(codigoDe(() => comAdmin().alterarPapel('m-admin', 'LEITOR', 'ANALISTA'))).toBe(
      'PERMISSAO_NEGADA',
    );
  });

  it('remove membro, mas nunca o DONO', () => {
    const org = comAdmin();
    org.removerMembro('m-admin', 'DONO');
    expect(org.membroPorId('m-admin')).toBeUndefined();
    expect(codigoDe(() => org.removerMembro('m-dono', 'DONO'))).toBe('DONO_IMUTAVEL');
  });

  it('ADMIN não remove outro ADMIN', () => {
    expect(codigoDe(() => comAdmin().removerMembro('m-admin', 'ADMIN'))).toBe(
      'REMOCAO_DE_ADMIN_NEGADA',
    );
  });

  it('reconstitui a partir de paraDados', () => {
    const org = comAdmin();
    const copia = Organizacao.reconstituir(org.paraDados());
    expect(copia.paraDados()).toEqual(org.paraDados());
    expect(copia.puxarEventos()).toEqual([]);
  });
});
