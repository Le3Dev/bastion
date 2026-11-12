import { describe, expect, it } from 'vitest';
import { Ator } from './Ator';
import { RegistroDeAuditoria } from './RegistroDeAuditoria';

const AGORA = new Date('2026-01-10T12:00:00Z');

const registrar = (): RegistroDeAuditoria =>
  RegistroDeAuditoria.registrar(
    {
      id: 'r-1',
      organizacaoId: 'org-1',
      ator: Ator.usuario('u-1', 'Ana'),
      acao: 'SISTEMA_CADASTRADO',
      alvo: 'sistema:s-1',
      detalhe: 'Cadastrou o sistema Loja',
    },
    AGORA,
  );

describe('RegistroDeAuditoria', () => {
  it('registra com os dados informados', () => {
    const registro = registrar();
    expect(registro.acao).toBe('SISTEMA_CADASTRADO');
    expect(registro.ator.nome).toBe('Ana');
    expect(registro.ocorridoEm).toEqual(AGORA);
  });

  it('não tem nenhum método que altere estado', () => {
    const registro = registrar();
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(registro)).filter(
      (nome) => nome !== 'constructor',
    );
    expect(metodos).toEqual(['paraDados']);
    for (const nome of Object.getOwnPropertyNames(Object.getPrototypeOf(registro))) {
      expect(nome).not.toMatch(/^(set|alterar|atualizar|remover|editar)/i);
    }
    const descritores = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(registro));
    for (const descritor of Object.values(descritores)) {
      expect(descritor.set).toBeUndefined();
    }
  });

  it('é congelado: tentativas de alterar falham', () => {
    const registro = registrar();
    expect(Object.isFrozen(registro)).toBe(true);
    expect(() => {
      (registro as { detalhe: string }).detalhe = 'adulterado';
    }).toThrow();
    expect(registro.detalhe).toBe('Cadastrou o sistema Loja');
  });

  it('Ator.sistema identifica ações automáticas', () => {
    expect(Ator.sistema().paraDados()).toEqual({ tipo: 'SISTEMA', id: null, nome: 'Bastion' });
  });

  it('reconstitui a partir dos dados', () => {
    const registro = registrar();
    expect(RegistroDeAuditoria.reconstituir(registro.paraDados()).paraDados()).toEqual(
      registro.paraDados(),
    );
  });
});
