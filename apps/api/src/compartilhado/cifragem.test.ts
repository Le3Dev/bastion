import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { criarCifragem, lerChaveDeCifragem } from './cifragem';

describe('cifragem', () => {
  const cifragem = criarCifragem(randomBytes(32));

  it('cifra e decifra de volta', () => {
    const opaco = cifragem.cifrar('senha-secreta ção');
    expect(opaco.startsWith('v1.')).toBe(true);
    expect(opaco).not.toContain('senha');
    expect(cifragem.decifrar(opaco)).toBe('senha-secreta ção');
  });

  it('gera valores diferentes para o mesmo texto (iv aleatório)', () => {
    expect(cifragem.cifrar('x')).not.toBe(cifragem.cifrar('x'));
  });

  it('falha com texto adulterado ou chave diferente', () => {
    const opaco = cifragem.cifrar('segredo');
    const partes = opaco.split('.');
    partes[3] = Buffer.from('outro-conteudo').toString('base64url');
    expect(() => cifragem.decifrar(partes.join('.'))).toThrow(/decifrar/);
    expect(() => cifragem.decifrar('lixo')).toThrow(/decifrar/);
    expect(() => criarCifragem(randomBytes(32)).decifrar(opaco)).toThrow(/decifrar/);
  });

  it('valida o tamanho da chave em base64 e hex', () => {
    const chave = randomBytes(32);
    expect(lerChaveDeCifragem(chave.toString('base64')).equals(chave)).toBe(true);
    expect(lerChaveDeCifragem(chave.toString('hex')).equals(chave)).toBe(true);
    expect(() => lerChaveDeCifragem('curta')).toThrow(/CHAVE_DE_CIFRAGEM/);
  });
});
