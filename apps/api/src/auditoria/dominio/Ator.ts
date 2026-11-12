export const TIPOS_DE_ATOR = ['USUARIO', 'CHAVE_DE_API', 'SISTEMA'] as const;

export type TipoDeAtor = (typeof TIPOS_DE_ATOR)[number];

/** Quem executou a ação. Objeto de valor imutável. */
export class Ator {
  private constructor(
    readonly tipo: TipoDeAtor,
    readonly id: string | null,
    readonly nome: string,
  ) {
    Object.freeze(this);
  }

  static criar(tipo: TipoDeAtor, id: string | null, nome: string): Ator {
    return new Ator(tipo, id, nome);
  }

  static usuario(id: string, nome: string): Ator {
    return new Ator('USUARIO', id, nome);
  }

  static chaveDeApi(id: string, nome: string): Ator {
    return new Ator('CHAVE_DE_API', id, nome);
  }

  static sistema(): Ator {
    return new Ator('SISTEMA', null, 'Bastion');
  }

  paraDados(): { tipo: TipoDeAtor; id: string | null; nome: string } {
    return { tipo: this.tipo, id: this.id, nome: this.nome };
  }
}
