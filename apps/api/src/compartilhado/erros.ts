/** Erro esperado da camada de aplicação, com status HTTP e código estável. */
export class ErroDeAplicacao extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes?: unknown;

  constructor(status: number, codigo: string, mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.name = 'ErroDeAplicacao';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

export const naoEncontrado = (oQue: string): ErroDeAplicacao =>
  new ErroDeAplicacao(404, 'NAO_ENCONTRADO', `${oQue} não encontrado.`);

export const naoAutenticado = (): ErroDeAplicacao =>
  new ErroDeAplicacao(401, 'NAO_AUTENTICADO', 'Faça login para continuar.');

export const conflito = (mensagem: string, codigo = 'CONFLITO'): ErroDeAplicacao =>
  new ErroDeAplicacao(409, codigo, mensagem);

export const tempoEsgotado = (mensagem: string, codigo = 'TEMPO_ESGOTADO'): ErroDeAplicacao =>
  new ErroDeAplicacao(504, codigo, mensagem);
