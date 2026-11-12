import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export type ModoDeLogin = 'FORMULARIO' | 'JSON';

export interface DadosDaCredencialDeTeste {
  readonly modo: ModoDeLogin;
  readonly urlDeLogin: string;
  readonly campoUsuario: string;
  readonly campoSenha: string;
  readonly indicadorDeSucesso: string;
  /** Segredos opacos: já chegam cifrados; o domínio não cifra, não decifra e nunca registra em log. */
  readonly segredoUsuarioCifrado: string;
  readonly segredoSenhaCifrado: string;
}

/** Objeto de valor imutável: credencial de uma conta de teste do sistema. */
export class CredencialDeTeste {
  private constructor(private readonly dados: DadosDaCredencialDeTeste) {
    Object.freeze(this);
  }

  static criar(dados: DadosDaCredencialDeTeste): CredencialDeTeste {
    for (const [campo, valor] of Object.entries(dados)) {
      if (typeof valor !== 'string' || valor.trim() === '') {
        throw new ErroDeDominio(
          `O campo ${campo} da credencial de teste é obrigatório.`,
          'CREDENCIAL_INCOMPLETA',
        );
      }
    }
    if (dados.modo !== 'FORMULARIO' && dados.modo !== 'JSON') {
      throw new ErroDeDominio('Modo de login inválido.', 'CREDENCIAL_INCOMPLETA');
    }
    return new CredencialDeTeste({ ...dados });
  }

  static reconstituir(dados: DadosDaCredencialDeTeste): CredencialDeTeste {
    return new CredencialDeTeste({ ...dados });
  }

  get modo(): ModoDeLogin {
    return this.dados.modo;
  }

  get urlDeLogin(): string {
    return this.dados.urlDeLogin;
  }

  get campoUsuario(): string {
    return this.dados.campoUsuario;
  }

  get campoSenha(): string {
    return this.dados.campoSenha;
  }

  get indicadorDeSucesso(): string {
    return this.dados.indicadorDeSucesso;
  }

  get segredoUsuarioCifrado(): string {
    return this.dados.segredoUsuarioCifrado;
  }

  get segredoSenhaCifrado(): string {
    return this.dados.segredoSenhaCifrado;
  }

  paraDados(): DadosDaCredencialDeTeste {
    return { ...this.dados };
  }

  /** Evita vazamento acidental dos segredos em logs. */
  toJSON(): Omit<DadosDaCredencialDeTeste, 'segredoUsuarioCifrado' | 'segredoSenhaCifrado'> {
    return {
      modo: this.dados.modo,
      urlDeLogin: this.dados.urlDeLogin,
      campoUsuario: this.dados.campoUsuario,
      campoSenha: this.dados.campoSenha,
      indicadorDeSucesso: this.dados.indicadorDeSucesso,
    };
  }
}
