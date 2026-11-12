import type { EstadoDoAchado } from './EstadoDoAchado';

export interface DadosDoHistorico {
  readonly em: Date;
  readonly de: EstadoDoAchado | null;
  readonly para: EstadoDoAchado;
  readonly ator: string;
  readonly comentario: string | null;
}

/** Entrada imutável do histórico de mudanças de estado. */
export class HistoricoDoAchado {
  readonly em: Date;
  readonly de: EstadoDoAchado | null;
  readonly para: EstadoDoAchado;
  readonly ator: string;
  readonly comentario: string | null;

  private constructor(dados: DadosDoHistorico) {
    this.em = dados.em;
    this.de = dados.de;
    this.para = dados.para;
    this.ator = dados.ator;
    this.comentario = dados.comentario;
  }

  static criar(dados: DadosDoHistorico): HistoricoDoAchado {
    return new HistoricoDoAchado(dados);
  }

  paraDados(): DadosDoHistorico {
    return { em: this.em, de: this.de, para: this.para, ator: this.ator, comentario: this.comentario };
  }
}
