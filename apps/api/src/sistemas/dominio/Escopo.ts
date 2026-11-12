export const REQUISICOES_POR_SEGUNDO_PADRAO = 5;

export interface DadosDoEscopo {
  hostsPermitidos: string[];
  dominiosBloqueados: string[];
  requisicoesPorSegundo: number;
}

/** Fronteira do que o Bastion pode tocar. Imutável. */
export class Escopo {
  private constructor(
    readonly hostsPermitidos: readonly string[],
    readonly dominiosBloqueados: readonly string[],
    readonly requisicoesPorSegundo: number,
  ) {
    Object.freeze(this);
  }

  static criar(dados: {
    hostsPermitidos: readonly string[];
    dominiosBloqueados: readonly string[];
    requisicoesPorSegundo?: number;
  }): Escopo {
    return new Escopo(
      [...dados.hostsPermitidos],
      [...dados.dominiosBloqueados],
      dados.requisicoesPorSegundo ?? REQUISICOES_POR_SEGUNDO_PADRAO,
    );
  }

  static doSistema(sistema: {
    hostDeHomologacao: string;
    dominioDeProducao: string;
  }): Escopo {
    return Escopo.criar({
      hostsPermitidos: [sistema.hostDeHomologacao],
      dominiosBloqueados: [sistema.dominioDeProducao],
    });
  }

  paraDados(): DadosDoEscopo {
    return {
      hostsPermitidos: [...this.hostsPermitidos],
      dominiosBloqueados: [...this.dominiosBloqueados],
      requisicoesPorSegundo: this.requisicoesPorSegundo,
    };
  }
}
