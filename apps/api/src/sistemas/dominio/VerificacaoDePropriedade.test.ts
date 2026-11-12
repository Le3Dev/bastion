import { describe, expect, it } from 'vitest';
import { VerificacaoDePropriedade } from './VerificacaoDePropriedade';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const AGORA = new Date('2026-01-10T12:00:00Z');

describe('VerificacaoDePropriedade', () => {
  it('nasce pendente e não é válida', () => {
    const v = VerificacaoDePropriedade.pendente('DNS_TXT', TOKEN);
    expect(v.estado).toBe('PENDENTE');
    expect(v.estaValida(AGORA)).toBe(false);
  });

  it('rejeita token fora do formato', () => {
    expect(() => VerificacaoDePropriedade.pendente('DNS_TXT', 'curto')).toThrow('32 caracteres');
    expect(() => VerificacaoDePropriedade.pendente('DNS_TXT', 'Z'.repeat(32))).toThrow('hexadecimais');
  });

  it('sucesso expira em 90 dias', () => {
    const v = VerificacaoDePropriedade.pendente('DNS_TXT', TOKEN).comSucesso(AGORA);
    expect(v.estado).toBe('VERIFICADO');
    expect(v.expiraEm).toEqual(new Date('2026-04-10T12:00:00Z'));
    expect(v.estaValida(new Date('2026-04-10T11:59:59Z'))).toBe(true);
    expect(v.estadoEm(new Date('2026-04-10T12:00:00Z'))).toBe('EXPIRADO');
    expect(v.estaValida(new Date('2026-05-01T00:00:00Z'))).toBe(false);
  });

  it('falha guarda a mensagem e é imutável', () => {
    const original = VerificacaoDePropriedade.pendente('ARQUIVO_WELL_KNOWN', TOKEN);
    const falha = original.comFalha('Arquivo não encontrado');
    expect(falha.estado).toBe('FALHOU');
    expect(falha.mensagem).toBe('Arquivo não encontrado');
    expect(original.estado).toBe('PENDENTE');
    expect(Object.isFrozen(original)).toBe(true);
  });

  it('gera as instruções para os três métodos', () => {
    const v = VerificacaoDePropriedade.pendente('DNS_TXT', TOKEN);
    expect(v.instrucoes('hml.loja.com.br')).toEqual({
      registroDns: {
        nome: '_bastion-verificacao.hml.loja.com.br',
        valor: `bastion-verificacao=${TOKEN}`,
      },
      arquivo: {
        url: 'https://hml.loja.com.br/.well-known/bastion-verificacao.txt',
        conteudo: TOKEN,
      },
      cabecalho: { nome: 'X-Bastion-Verificacao', valor: TOKEN },
    });
  });

  it('reconstitui a partir dos dados', () => {
    const v = VerificacaoDePropriedade.pendente('CABECALHO_HTTP', TOKEN).comSucesso(AGORA);
    expect(VerificacaoDePropriedade.reconstituir(v.paraDados()).paraDados()).toEqual(v.paraDados());
  });
});
