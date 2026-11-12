import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import type { MetodoDeVerificacao } from './MetodoDeVerificacao';

export type EstadoDaVerificacao = 'PENDENTE' | 'VERIFICADO' | 'FALHOU' | 'EXPIRADO';

export const VALIDADE_DA_VERIFICACAO_EM_DIAS = 90;
const DIA_EM_MS = 24 * 60 * 60 * 1000;

export interface DadosDaVerificacao {
  metodo: MetodoDeVerificacao;
  token: string;
  estado: EstadoDaVerificacao;
  verificadoEm: Date | null;
  expiraEm: Date | null;
  mensagem: string | null;
}

export interface InstrucoesDeVerificacao {
  registroDns: { nome: string; valor: string };
  arquivo: { url: string; conteudo: string };
  cabecalho: { nome: string; valor: string };
}

const FORMATO_DO_TOKEN = /^[0-9a-f]{32}$/;

/** Objeto de valor imutável: toda transição devolve uma nova instância. */
export class VerificacaoDePropriedade {
  private constructor(
    readonly metodo: MetodoDeVerificacao,
    readonly token: string,
    readonly estado: EstadoDaVerificacao,
    readonly verificadoEm: Date | null,
    readonly expiraEm: Date | null,
    readonly mensagem: string | null,
  ) {
    Object.freeze(this);
  }

  static pendente(metodo: MetodoDeVerificacao, token: string): VerificacaoDePropriedade {
    if (!FORMATO_DO_TOKEN.test(token)) {
      throw new ErroDeDominio(
        'O token de verificação deve ter 32 caracteres hexadecimais.',
        'TOKEN_INVALIDO',
      );
    }
    return new VerificacaoDePropriedade(metodo, token, 'PENDENTE', null, null, null);
  }

  static reconstituir(dados: DadosDaVerificacao): VerificacaoDePropriedade {
    return new VerificacaoDePropriedade(
      dados.metodo,
      dados.token,
      dados.estado,
      dados.verificadoEm,
      dados.expiraEm,
      dados.mensagem,
    );
  }

  comSucesso(agora: Date): VerificacaoDePropriedade {
    const expiraEm = new Date(agora.getTime() + VALIDADE_DA_VERIFICACAO_EM_DIAS * DIA_EM_MS);
    return new VerificacaoDePropriedade(this.metodo, this.token, 'VERIFICADO', agora, expiraEm, null);
  }

  comFalha(mensagem: string): VerificacaoDePropriedade {
    return new VerificacaoDePropriedade(this.metodo, this.token, 'FALHOU', null, null, mensagem);
  }

  estadoEm(agora: Date): EstadoDaVerificacao {
    if (this.estado === 'VERIFICADO' && this.expiraEm !== null && this.expiraEm.getTime() <= agora.getTime()) {
      return 'EXPIRADO';
    }
    return this.estado;
  }

  estaValida(agora: Date): boolean {
    return this.estadoEm(agora) === 'VERIFICADO';
  }

  instrucoes(host: string): InstrucoesDeVerificacao {
    return {
      registroDns: {
        nome: `_bastion-verificacao.${host}`,
        valor: `bastion-verificacao=${this.token}`,
      },
      arquivo: {
        url: `https://${host}/.well-known/bastion-verificacao.txt`,
        conteudo: this.token,
      },
      cabecalho: { nome: 'X-Bastion-Verificacao', valor: this.token },
    };
  }

  paraDados(): DadosDaVerificacao {
    return {
      metodo: this.metodo,
      token: this.token,
      estado: this.estado,
      verificadoEm: this.verificadoEm,
      expiraEm: this.expiraEm,
      mensagem: this.mensagem,
    };
  }
}
