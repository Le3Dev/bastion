export class ErroDeDominio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeDominio";
  }
}

/** Extrai uma mensagem legível de qualquer erro capturado. */
export const mensagemDeErro = (erro: unknown): string =>
  erro instanceof Error ? erro.message : "Ocorreu um erro inesperado.";
