import { Email, ErroDeDominio } from '@bastion/dominio-compartilhado';

export interface DadosDoUsuario {
  id: string;
  email: string;
  nome: string;
}

/** Identidade global de uma pessoa. A senha fica fora do domínio. */
export class Usuario {
  private constructor(
    readonly id: string,
    readonly email: Email,
    private _nome: string,
  ) {}

  static criar(dados: { id: string; email: string; nome: string }): Usuario {
    return new Usuario(dados.id, Email.criar(dados.email), Usuario.validarNome(dados.nome));
  }

  static reconstituir(dados: DadosDoUsuario): Usuario {
    return new Usuario(dados.id, Email.criar(dados.email), dados.nome);
  }

  get nome(): string {
    return this._nome;
  }

  renomear(nome: string): void {
    this._nome = Usuario.validarNome(nome);
  }

  paraDados(): DadosDoUsuario {
    return { id: this.id, email: this.email.valor, nome: this._nome };
  }

  private static validarNome(nome: string): string {
    const limpo = nome.trim();
    if (limpo === '') throw new ErroDeDominio('O nome do usuário é obrigatório.', 'NOME_OBRIGATORIO');
    return limpo;
  }
}
