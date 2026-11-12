import {
  criarEvento,
  ErroDeDominio,
  hostPertenceAoDominio,
  normalizarHost,
} from '@bastion/dominio-compartilhado';
import type { EventoDeSistema } from './eventos';
import { Escopo } from './Escopo';
import type { MetodoDeVerificacao } from './MetodoDeVerificacao';
import { TIPOS_DE_SISTEMA, type TipoDeSistema } from './TipoDeSistema';
import { VerificacaoDePropriedade, type DadosDaVerificacao } from './VerificacaoDePropriedade';

export interface DadosDoSistema {
  id: string;
  organizacaoId: string;
  nome: string;
  tipo: TipoDeSistema;
  urlDeHomologacao: string;
  dominioDeProducao: string;
  verificacao: DadosDaVerificacao;
  ultimaNota: number | null;
  criadoEm: Date;
}

export interface DadosParaCadastrarSistema {
  id: string;
  organizacaoId: string;
  nome: string;
  tipo: TipoDeSistema;
  urlDeHomologacao: string;
  dominioDeProducao: string;
  metodoDeVerificacao: MetodoDeVerificacao;
  token: string;
}

/** Agregado raiz: um sistema de homologação autorizado para avaliação. */
export class Sistema {
  private eventos: EventoDeSistema[] = [];

  private constructor(
    readonly id: string,
    readonly organizacaoId: string,
    readonly nome: string,
    readonly tipo: TipoDeSistema,
    readonly urlDeHomologacao: string,
    readonly dominioDeProducao: string,
    private _verificacao: VerificacaoDePropriedade,
    private _ultimaNota: number | null,
    readonly criadoEm: Date,
  ) {}

  static cadastrar(dados: DadosParaCadastrarSistema, agora: Date): Sistema {
    const nome = dados.nome.trim();
    if (nome === '') {
      throw new ErroDeDominio('O nome do sistema é obrigatório.', 'NOME_OBRIGATORIO');
    }
    if (!TIPOS_DE_SISTEMA.includes(dados.tipo)) {
      throw new ErroDeDominio('Tipo de sistema inválido.', 'TIPO_INVALIDO');
    }
    const host = Sistema.hostDaUrl(dados.urlDeHomologacao);
    const dominio = normalizarHost(dados.dominioDeProducao.trim());
    if (dominio === '') {
      throw new ErroDeDominio(
        'Informe o domínio de produção para que o Bastion nunca o avalie.',
        'DOMINIO_DE_PRODUCAO_OBRIGATORIO',
      );
    }
    if (host === dominio || hostPertenceAoDominio(host, dominio)) {
      throw new ErroDeDominio(
        'A URL de homologação pertence ao domínio de produção declarado; o Bastion nunca avalia produção.',
        'HOMOLOGACAO_EM_PRODUCAO',
      );
    }
    const sistema = new Sistema(
      dados.id,
      dados.organizacaoId,
      nome,
      dados.tipo,
      dados.urlDeHomologacao.trim(),
      dominio,
      VerificacaoDePropriedade.pendente(dados.metodoDeVerificacao, dados.token),
      null,
      agora,
    );
    sistema.eventos.push(
      criarEvento('SistemaCadastrado', dados.organizacaoId, {
        sistemaId: dados.id,
        nome,
        hostDeHomologacao: host,
      }, agora),
    );
    return sistema;
  }

  static reconstituir(dados: DadosDoSistema): Sistema {
    return new Sistema(
      dados.id,
      dados.organizacaoId,
      dados.nome,
      dados.tipo,
      dados.urlDeHomologacao,
      dados.dominioDeProducao,
      VerificacaoDePropriedade.reconstituir(dados.verificacao),
      dados.ultimaNota,
      dados.criadoEm,
    );
  }

  get hostDeHomologacao(): string {
    return Sistema.hostDaUrl(this.urlDeHomologacao);
  }

  get verificacao(): VerificacaoDePropriedade {
    return this._verificacao;
  }

  get ultimaNota(): number | null {
    return this._ultimaNota;
  }

  trocarMetodoDeVerificacao(metodo: MetodoDeVerificacao, token: string): void {
    this._verificacao = VerificacaoDePropriedade.pendente(metodo, token);
  }

  registrarResultadoDaVerificacao(verificado: boolean, mensagem: string, agora: Date): void {
    const metodo = this._verificacao.metodo;
    if (verificado) {
      this._verificacao = this._verificacao.comSucesso(agora);
      this.eventos.push(
        criarEvento('SistemaVerificado', this.organizacaoId, { sistemaId: this.id, metodo }, agora),
      );
    } else {
      this._verificacao = this._verificacao.comFalha(mensagem);
      this.eventos.push(
        criarEvento('VerificacaoDeSistemaFalhou', this.organizacaoId, {
          sistemaId: this.id,
          metodo,
          mensagem,
        }, agora),
      );
    }
  }

  estaVerificado(agora: Date): boolean {
    return this._verificacao.estaValida(agora);
  }

  escopo(): Escopo {
    return Escopo.doSistema({
      hostDeHomologacao: this.hostDeHomologacao,
      dominioDeProducao: this.dominioDeProducao,
    });
  }

  atualizarUltimaNota(nota: number): void {
    if (!Number.isInteger(nota) || nota < 0 || nota > 100) {
      throw new ErroDeDominio('A nota deve ser um inteiro entre 0 e 100.', 'NOTA_INVALIDA');
    }
    this._ultimaNota = nota;
  }

  paraDados(): DadosDoSistema {
    return {
      id: this.id,
      organizacaoId: this.organizacaoId,
      nome: this.nome,
      tipo: this.tipo,
      urlDeHomologacao: this.urlDeHomologacao,
      dominioDeProducao: this.dominioDeProducao,
      verificacao: this._verificacao.paraDados(),
      ultimaNota: this._ultimaNota,
      criadoEm: this.criadoEm,
    };
  }

  puxarEventos(): EventoDeSistema[] {
    const pendentes = this.eventos;
    this.eventos = [];
    return pendentes;
  }

  private static hostDaUrl(valor: string): string {
    let url: URL;
    try {
      url = new URL(valor.trim());
    } catch {
      throw new ErroDeDominio('A URL de homologação é inválida.', 'URL_INVALIDA');
    }
    if (url.protocol !== 'https:') {
      throw new ErroDeDominio('A URL de homologação deve usar https://.', 'URL_INVALIDA');
    }
    return normalizarHost(url.hostname);
  }
}
