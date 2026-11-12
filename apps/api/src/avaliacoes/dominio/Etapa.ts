import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export type EstadoDaEtapa = 'PENDENTE' | 'EM_EXECUCAO' | 'CONCLUIDA' | 'FALHOU' | 'IGNORADA';

export interface DadosDaEtapa {
  readonly ordem: number;
  readonly nome: string;
  readonly estado: EstadoDaEtapa;
  readonly progresso: number;
}

/** Entidade interna do agregado Avaliacao; só é acessada através dele. */
export class Etapa {
  readonly ordem: number;
  readonly nome: string;
  private _estado: EstadoDaEtapa;
  private _progresso: number;

  private constructor(dados: DadosDaEtapa) {
    this.ordem = dados.ordem;
    this.nome = dados.nome;
    this._estado = dados.estado;
    this._progresso = dados.progresso;
  }

  static criar(ordem: number, nome: string): Etapa {
    return new Etapa({ ordem, nome, estado: 'PENDENTE', progresso: 0 });
  }

  static reconstituir(dados: DadosDaEtapa): Etapa {
    return new Etapa(dados);
  }

  get estado(): EstadoDaEtapa {
    return this._estado;
  }

  get progresso(): number {
    return this._progresso;
  }

  atualizar(estado: EstadoDaEtapa, progresso: number): void {
    if (!Number.isFinite(progresso) || progresso < 0 || progresso > 100) {
      throw new ErroDeDominio('O progresso da etapa deve estar entre 0 e 100', 'PROGRESSO_INVALIDO');
    }
    this._estado = estado;
    this._progresso = progresso;
  }

  paraDados(): DadosDaEtapa {
    return { ordem: this.ordem, nome: this.nome, estado: this._estado, progresso: this._progresso };
  }
}
