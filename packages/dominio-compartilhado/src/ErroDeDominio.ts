export class ErroDeDominio extends Error {
  readonly codigo: string;

  constructor(mensagem: string, codigo: string) {
    super(mensagem);
    this.name = 'ErroDeDominio';
    this.codigo = codigo;
  }
}
