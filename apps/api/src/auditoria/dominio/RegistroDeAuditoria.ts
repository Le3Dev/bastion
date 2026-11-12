import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import { ACOES, type Acao } from './Acao';
import { Ator, type TipoDeAtor } from './Ator';

export interface DadosDoRegistroDeAuditoria {
  id: string;
  organizacaoId: string;
  ator: { tipo: TipoDeAtor; id: string | null; nome: string };
  acao: Acao;
  alvo: string;
  detalhe: string;
  ocorridoEm: Date;
}

/** Trilha de auditoria: entidade imutável, só de inclusão. */
export class RegistroDeAuditoria {
  private constructor(
    readonly id: string,
    readonly organizacaoId: string,
    readonly ator: Ator,
    readonly acao: Acao,
    readonly alvo: string,
    readonly detalhe: string,
    readonly ocorridoEm: Date,
  ) {
    Object.freeze(this);
  }

  static registrar(
    dados: {
      id: string;
      organizacaoId: string;
      ator: Ator;
      acao: Acao;
      alvo: string;
      detalhe: string;
    },
    agora: Date,
  ): RegistroDeAuditoria {
    if (!ACOES.includes(dados.acao)) {
      throw new ErroDeDominio('Ação de auditoria desconhecida.', 'ACAO_INVALIDA');
    }
    return new RegistroDeAuditoria(
      dados.id,
      dados.organizacaoId,
      dados.ator,
      dados.acao,
      dados.alvo,
      dados.detalhe,
      new Date(agora.getTime()),
    );
  }

  static reconstituir(dados: DadosDoRegistroDeAuditoria): RegistroDeAuditoria {
    return new RegistroDeAuditoria(
      dados.id,
      dados.organizacaoId,
      Ator.criar(dados.ator.tipo, dados.ator.id, dados.ator.nome),
      dados.acao,
      dados.alvo,
      dados.detalhe,
      dados.ocorridoEm,
    );
  }

  paraDados(): DadosDoRegistroDeAuditoria {
    return {
      id: this.id,
      organizacaoId: this.organizacaoId,
      ator: this.ator.paraDados(),
      acao: this.acao,
      alvo: this.alvo,
      detalhe: this.detalhe,
      ocorridoEm: this.ocorridoEm,
    };
  }
}
