import { ErroDeDominio } from './ErroDeDominio';

const PADRAO_DE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export class Email {
  readonly valor: string;

  private constructor(valor: string) {
    this.valor = valor;
  }

  static criar(valor: string): Email {
    const normalizado = valor.trim().toLowerCase();
    if (!PADRAO_DE_EMAIL.test(normalizado)) {
      throw new ErroDeDominio(`E-mail inválido: ${valor}`, 'EMAIL_INVALIDO');
    }
    return new Email(normalizado);
  }

  igualA(outro: Email): boolean {
    return this.valor === outro.valor;
  }
}
