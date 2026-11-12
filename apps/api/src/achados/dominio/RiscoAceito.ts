import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export interface DadosDoRiscoAceito {
  readonly justificativa: string;
  readonly responsavel: string;
  readonly validoAte: Date;
}

const TAMANHO_MINIMO_DA_JUSTIFICATIVA = 20;

export class RiscoAceito {
  readonly justificativa: string;
  readonly responsavel: string;
  readonly validoAte: Date;

  private constructor(dados: DadosDoRiscoAceito) {
    this.justificativa = dados.justificativa;
    this.responsavel = dados.responsavel;
    this.validoAte = dados.validoAte;
  }

  static criar(dados: DadosDoRiscoAceito, agora: Date): RiscoAceito {
    const justificativa = dados.justificativa.trim();
    const responsavel = dados.responsavel.trim();
    if (justificativa.length < TAMANHO_MINIMO_DA_JUSTIFICATIVA) {
      throw new ErroDeDominio(
        `A justificativa deve ter pelo menos ${TAMANHO_MINIMO_DA_JUSTIFICATIVA} caracteres`,
        'JUSTIFICATIVA_CURTA',
      );
    }
    if (responsavel === '') {
      throw new ErroDeDominio('Informe o responsável pelo aceite do risco', 'RESPONSAVEL_OBRIGATORIO');
    }
    if (Number.isNaN(dados.validoAte.getTime()) || dados.validoAte.getTime() <= agora.getTime()) {
      throw new ErroDeDominio('A validade do aceite deve ser uma data futura', 'VALIDADE_INVALIDA');
    }
    return new RiscoAceito({ justificativa, responsavel, validoAte: new Date(dados.validoAte) });
  }

  static reconstituir(dados: DadosDoRiscoAceito): RiscoAceito {
    return new RiscoAceito(dados);
  }

  venceuEm(agora: Date): boolean {
    return agora.getTime() >= this.validoAte.getTime();
  }

  paraDados(): DadosDoRiscoAceito {
    return { justificativa: this.justificativa, responsavel: this.responsavel, validoAte: this.validoAte };
  }
}
