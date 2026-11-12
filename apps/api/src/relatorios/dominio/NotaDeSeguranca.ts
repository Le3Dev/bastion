import { PESO_DA_SEVERIDADE, type Severidade } from '@bastion/dominio-compartilhado';
import { estaEmAberto, type EstadoDoAchado } from '../../achados/dominio/EstadoDoAchado';

export type FaixaDaNota = 'BOA' | 'ATENCAO' | 'CRITICA';

export interface AchadoParaNota {
  readonly severidade: Severidade;
  readonly estado: EstadoDoAchado;
}

export class NotaDeSeguranca {
  readonly valor: number;

  private constructor(valor: number) {
    this.valor = valor;
  }

  /** 100 menos a soma dos pesos dos achados em aberto, com mínimo 0. */
  static calcular(achados: readonly AchadoParaNota[]): NotaDeSeguranca {
    const penalidade = achados
      .filter((achado) => estaEmAberto(achado.estado))
      .reduce((total, achado) => total + PESO_DA_SEVERIDADE[achado.severidade], 0);
    return new NotaDeSeguranca(Math.max(0, 100 - penalidade));
  }

  static reconstituir(valor: number): NotaDeSeguranca {
    return new NotaDeSeguranca(valor);
  }

  get faixa(): FaixaDaNota {
    if (this.valor >= 80) return 'BOA';
    if (this.valor >= 50) return 'ATENCAO';
    return 'CRITICA';
  }
}
