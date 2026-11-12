import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export type FrequenciaDaAgenda = 'DIARIA' | 'SEMANAL' | 'MENSAL';
export type TipoDeAgenda = 'UNICA' | 'RECORRENTE';

export interface DadosDaAgenda {
  readonly tipo: TipoDeAgenda;
  readonly frequencia: FrequenciaDaAgenda | null;
}

export class Agenda {
  readonly tipo: TipoDeAgenda;
  readonly frequencia: FrequenciaDaAgenda | null;

  private constructor(tipo: TipoDeAgenda, frequencia: FrequenciaDaAgenda | null) {
    this.tipo = tipo;
    this.frequencia = frequencia;
  }

  static unica(): Agenda {
    return new Agenda('UNICA', null);
  }

  static recorrente(frequencia: FrequenciaDaAgenda): Agenda {
    return new Agenda('RECORRENTE', frequencia);
  }

  static reconstituir(dados: DadosDaAgenda): Agenda {
    if (dados.tipo === 'UNICA') return Agenda.unica();
    if (dados.frequencia === null) {
      throw new ErroDeDominio('Agenda recorrente exige frequência', 'AGENDA_INVALIDA');
    }
    return Agenda.recorrente(dados.frequencia);
  }

  get ehUnica(): boolean {
    return this.tipo === 'UNICA';
  }

  paraDados(): DadosDaAgenda {
    return { tipo: this.tipo, frequencia: this.frequencia };
  }
}
