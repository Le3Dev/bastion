import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Cifra de segredos em repouso (credenciais de teste, cabeçalhos de conector). Formato: `v1.<iv>.<tag>.<texto>` em base64url. */
export interface Cifragem {
  cifrar(texto: string): string;
  decifrar(opaco: string): string;
}

const TAMANHO_DA_CHAVE = 32;
const TAMANHO_DO_IV = 12;

/** Aceita 32 bytes em base64 ou em hexadecimal (64 caracteres). */
export const lerChaveDeCifragem = (valor: string): Buffer => {
  const texto = valor.trim();
  const candidata = /^[0-9a-fA-F]{64}$/.test(texto)
    ? Buffer.from(texto, 'hex')
    : Buffer.from(texto, 'base64');
  if (candidata.length !== TAMANHO_DA_CHAVE) {
    throw new Error(
      'CHAVE_DE_CIFRAGEM inválida: informe exatamente 32 bytes em base64 ou hexadecimal ' +
        '(gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))").',
    );
  }
  return candidata;
};

export const criarCifragem = (chave: Buffer): Cifragem => {
  if (chave.length !== TAMANHO_DA_CHAVE) {
    throw new Error('A chave de cifragem deve ter 32 bytes.');
  }
  return {
    cifrar(texto) {
      try {
        const iv = randomBytes(TAMANHO_DO_IV);
        const cifra = createCipheriv('aes-256-gcm', chave, iv);
        const conteudo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
        return ['v1', iv, cifra.getAuthTag(), conteudo]
          .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
          .join('.');
      } catch {
        throw new Error('Não foi possível cifrar o segredo.');
      }
    },
    decifrar(opaco) {
      try {
        const [versao, iv, tag, conteudo] = opaco.split('.');
        if (versao !== 'v1' || !iv || !tag || conteudo === undefined) {
          throw new Error('formato');
        }
        const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'));
        decifra.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decifra.update(Buffer.from(conteudo, 'base64url')),
          decifra.final(),
        ]).toString('utf8');
      } catch {
        throw new Error(
          'Não foi possível decifrar o segredo: valor adulterado ou chave de cifragem diferente da usada para cifrar.',
        );
      }
    },
  };
};
