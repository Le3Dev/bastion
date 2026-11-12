import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export interface DadosDaAutorizacaoDeTeste {
  readonly responsavel: string;
  readonly referencia: string;
  /** ISO 8601; ausente em registros anteriores ao campo. */
  readonly concedidaEm?: string;
}

/** Objeto de valor imutável: autorização por escrito para testes ativos. */
export class AutorizacaoDeTeste {
  private constructor(
    readonly responsavel: string,
    readonly referencia: string,
    readonly concedidaEm: Date | null,
  ) {
    Object.freeze(this);
  }

  static criar(dados: { responsavel: string; referencia: string }, agora: Date): AutorizacaoDeTeste {
    const responsavel = dados.responsavel.trim();
    const referencia = dados.referencia.trim();
    if (responsavel === '' || referencia === '') {
      throw new ErroDeDominio(
        'Informe o responsável e a referência do escopo autorizado.',
        'AUTORIZACAO_INCOMPLETA',
      );
    }
    return new AutorizacaoDeTeste(responsavel, referencia, agora);
  }

  static reconstituir(dados: DadosDaAutorizacaoDeTeste): AutorizacaoDeTeste {
    return new AutorizacaoDeTeste(
      dados.responsavel,
      dados.referencia,
      dados.concedidaEm === undefined ? null : new Date(dados.concedidaEm),
    );
  }

  paraDados(): DadosDaAutorizacaoDeTeste {
    return {
      responsavel: this.responsavel,
      referencia: this.referencia,
      ...(this.concedidaEm === null ? {} : { concedidaEm: this.concedidaEm.toISOString() }),
    };
  }
}
