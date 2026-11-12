import { Email, ErroDeDominio, type Papel } from '@bastion/dominio-compartilhado';

export type EstadoDoMembro = 'ATIVO' | 'CONVIDADO';

export interface DadosDoMembro {
  id: string;
  usuarioId: string | null;
  email: string;
  nome: string | null;
  papel: Papel;
  estado: EstadoDoMembro;
  desde: Date;
}

/** Entidade interna do agregado Organizacao: acesse sempre pela raiz. */
export class Membro {
  private constructor(
    readonly id: string,
    private _usuarioId: string | null,
    readonly email: Email,
    private _nome: string | null,
    private _papel: Papel,
    private _estado: EstadoDoMembro,
    private _desde: Date,
  ) {}

  static convidar(dados: { id: string; email: string; papel: Papel }, agora: Date): Membro {
    return new Membro(dados.id, null, Email.criar(dados.email), null, dados.papel, 'CONVIDADO', agora);
  }

  static ativo(
    dados: { id: string; usuarioId: string; email: string; nome: string; papel: Papel },
    agora: Date,
  ): Membro {
    return new Membro(
      dados.id,
      dados.usuarioId,
      Email.criar(dados.email),
      dados.nome,
      dados.papel,
      'ATIVO',
      agora,
    );
  }

  static reconstituir(dados: DadosDoMembro): Membro {
    return new Membro(
      dados.id,
      dados.usuarioId,
      Email.criar(dados.email),
      dados.nome,
      dados.papel,
      dados.estado,
      dados.desde,
    );
  }

  get usuarioId(): string | null {
    return this._usuarioId;
  }
  get nome(): string | null {
    return this._nome;
  }
  get papel(): Papel {
    return this._papel;
  }
  get estado(): EstadoDoMembro {
    return this._estado;
  }
  get desde(): Date {
    return this._desde;
  }

  aceitarConvite(usuarioId: string, nome: string, agora: Date): void {
    if (this._estado !== 'CONVIDADO') {
      throw new ErroDeDominio('Este convite já foi aceito.', 'CONVITE_JA_ACEITO');
    }
    this._usuarioId = usuarioId;
    this._nome = nome;
    this._estado = 'ATIVO';
    this._desde = agora;
  }

  alterarPapel(papel: Papel): void {
    this._papel = papel;
  }

  paraDados(): DadosDoMembro {
    return {
      id: this.id,
      usuarioId: this._usuarioId,
      email: this.email.valor,
      nome: this._nome,
      papel: this._papel,
      estado: this._estado,
      desde: this._desde,
    };
  }
}
