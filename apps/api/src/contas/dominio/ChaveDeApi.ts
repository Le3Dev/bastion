import { criarEvento, ErroDeDominio, type Papel } from '@bastion/dominio-compartilhado';
import type { EventoDeChaveDeApi } from './eventos';

export interface DadosDaChaveDeApi {
  id: string;
  organizacaoId: string;
  nome: string;
  papel: Papel;
  prefixo: string;
  hashDoSegredo: string;
  criadaEm: Date;
  revogadaEm: Date | null;
  ultimoUsoEm: Date | null;
}

/** Chave `bst_...`: só o hash do segredo é guardado. */
export class ChaveDeApi {
  private eventos: EventoDeChaveDeApi[] = [];

  private constructor(private dados: DadosDaChaveDeApi) {}

  static criar(
    dados: {
      id: string;
      organizacaoId: string;
      nome: string;
      papel: Papel;
      prefixo: string;
      hashDoSegredo: string;
    },
    agora: Date,
  ): ChaveDeApi {
    const nome = dados.nome.trim();
    if (nome === '') {
      throw new ErroDeDominio('O nome da chave de API é obrigatório.', 'NOME_OBRIGATORIO');
    }
    if (dados.papel === 'DONO') {
      throw new ErroDeDominio('Uma chave de API não pode ter o papel DONO.', 'PAPEL_INVALIDO_PARA_CHAVE');
    }
    if (dados.hashDoSegredo.trim() === '') {
      throw new ErroDeDominio('O hash do segredo é obrigatório.', 'HASH_OBRIGATORIO');
    }
    const chave = new ChaveDeApi({
      ...dados,
      nome,
      criadaEm: agora,
      revogadaEm: null,
      ultimoUsoEm: null,
    });
    chave.eventos.push(
      criarEvento('ChaveDeApiCriada', dados.organizacaoId, {
        chaveId: dados.id,
        nome,
        papel: dados.papel,
      }, agora),
    );
    return chave;
  }

  static reconstituir(dados: DadosDaChaveDeApi): ChaveDeApi {
    return new ChaveDeApi({ ...dados });
  }

  get id(): string {
    return this.dados.id;
  }
  get organizacaoId(): string {
    return this.dados.organizacaoId;
  }
  get nome(): string {
    return this.dados.nome;
  }
  get papel(): Papel {
    return this.dados.papel;
  }
  get prefixo(): string {
    return this.dados.prefixo;
  }
  get hashDoSegredo(): string {
    return this.dados.hashDoSegredo;
  }
  get estaAtiva(): boolean {
    return this.dados.revogadaEm === null;
  }

  revogar(agora: Date): void {
    if (!this.estaAtiva) {
      throw new ErroDeDominio('Esta chave de API já foi revogada.', 'CHAVE_JA_REVOGADA');
    }
    this.dados.revogadaEm = agora;
    this.eventos.push(
      criarEvento('ChaveDeApiRevogada', this.dados.organizacaoId, { chaveId: this.dados.id }, agora),
    );
  }

  registrarUso(agora: Date): void {
    if (!this.estaAtiva) {
      throw new ErroDeDominio('Esta chave de API foi revogada.', 'CHAVE_REVOGADA');
    }
    this.dados.ultimoUsoEm = agora;
  }

  paraDados(): DadosDaChaveDeApi {
    return { ...this.dados };
  }

  puxarEventos(): EventoDeChaveDeApi[] {
    const pendentes = this.eventos;
    this.eventos = [];
    return pendentes;
  }
}
