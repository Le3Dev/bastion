import { hash, verify } from '@node-rs/argon2';

/** Argon2id com os parâmetros padrão recomendados da biblioteca. */
export const gerarHash = (senha: string): Promise<string> => hash(senha);

export const conferir = async (hashDaSenha: string, senha: string): Promise<boolean> => {
  try {
    return await verify(hashDaSenha, senha);
  } catch {
    return false;
  }
};
