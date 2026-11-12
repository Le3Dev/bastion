import {
  ErroDeDominio,
  criarEvento,
  type EventoDeDominio,
  type Identificador,
} from '@bastion/dominio-compartilhado';
import { Agenda, type DadosDaAgenda } from './Agenda';
import { AutorizacaoDeTeste, type DadosDaAutorizacaoDeTeste } from './AutorizacaoDeTeste';
import { Etapa, type DadosDaEtapa, type EstadoDaEtapa } from './Etapa';
import { podeTransicionar, type EstadoDaAvaliacao } from './EstadoDaAvaliacao';
import {
  etapasDoPerfil,
  perfilDisponivelNoMvp,
  perfilEhAtivo,
  tempoMaximoDeExecucaoMs,
  type PerfilDeAvaliacao,
} from './PerfilDeAvaliacao';
import type {
  AvaliacaoCancelada,
  AvaliacaoConcluida,
  AvaliacaoFalhou,
  AvaliacaoSolicitada,
  OrigemDaAvaliacao,
} from './eventos';

const TEMPO_MAXIMO_DA_PREPARACAO_MS = 20 * 60_000;

export interface DadosDaAvaliacao {
  readonly id: Identificador;
  readonly organizacaoId: Identificador;
  readonly sistemaId: Identificador;
  readonly perfil: PerfilDeAvaliacao;
  readonly agenda: DadosDaAgenda;
  readonly notaMinima: number;
  readonly origem: OrigemDaAvaliacao;
  readonly solicitadaPor: string;
  readonly estado: EstadoDaAvaliacao;
  readonly estadoDesde: Date;
  readonly nota: number | null;
  readonly etapas: readonly DadosDaEtapa[];
  readonly solicitadaEm: Date;
  readonly iniciadaEm: Date | null;
  readonly concluidaEm: Date | null;
  readonly motivoDaFalha: string | null;
  /** Achado que esta avaliação revalida (avaliação de revalidação); ausente nas demais. */
  readonly achadoRevalidadoId?: Identificador | null;
  /** Autorização por escrito (perfis ativos); ausente em registros antigos. */
  readonly autorizacao?: DadosDaAutorizacaoDeTeste | null;
  readonly permitirCriacaoDeDados?: boolean;
}

export interface ParametrosDeSolicitacao {
  readonly id: Identificador;
  readonly organizacaoId: Identificador;
  readonly sistemaId: Identificador;
  readonly perfil: PerfilDeAvaliacao;
  readonly agenda: Agenda;
  readonly notaMinima: number;
  readonly origem: OrigemDaAvaliacao;
  readonly solicitadaPor: string;
  readonly sistemaVerificado: boolean;
  readonly achadoRevalidadoId?: Identificador | null;
  readonly autorizacao?: AutorizacaoDeTeste;
  readonly permitirCriacaoDeDados?: boolean;
}

/** Agregado raiz: só ele muda o próprio estado. */
export class Avaliacao {
  private readonly eventos: EventoDeDominio[] = [];
  private readonly etapas: Etapa[];
  private _estado: EstadoDaAvaliacao;
  private _estadoDesde: Date;
  private _nota: number | null;
  private _iniciadaEm: Date | null;
  private _concluidaEm: Date | null;
  private _motivoDaFalha: string | null;

  private constructor(
    private readonly dados: Pick<
      DadosDaAvaliacao,
      | 'id'
      | 'organizacaoId'
      | 'sistemaId'
      | 'perfil'
      | 'notaMinima'
      | 'origem'
      | 'solicitadaPor'
      | 'solicitadaEm'
      | 'achadoRevalidadoId'
    >,
    private readonly _autorizacao: AutorizacaoDeTeste | null,
    private readonly _permitirCriacaoDeDados: boolean,
    private readonly _agenda: Agenda,
    etapas: Etapa[],
    estado: EstadoDaAvaliacao,
    estadoDesde: Date,
    nota: number | null,
    iniciadaEm: Date | null,
    concluidaEm: Date | null,
    motivoDaFalha: string | null,
  ) {
    this.etapas = etapas;
    this._estado = estado;
    this._estadoDesde = estadoDesde;
    this._nota = nota;
    this._iniciadaEm = iniciadaEm;
    this._concluidaEm = concluidaEm;
    this._motivoDaFalha = motivoDaFalha;
  }

  static solicitar(parametros: ParametrosDeSolicitacao, agora: Date): Avaliacao {
    if (!perfilDisponivelNoMvp(parametros.perfil)) {
      throw new ErroDeDominio('Perfil disponível depois do MVP', 'PERFIL_INDISPONIVEL');
    }
    if (!parametros.agenda.ehUnica) {
      throw new ErroDeDominio(
        'Avaliações recorrentes ainda não estão disponíveis',
        'AGENDAMENTO_INDISPONIVEL',
      );
    }
    if (!Number.isInteger(parametros.notaMinima) || parametros.notaMinima < 0 || parametros.notaMinima > 100) {
      throw new ErroDeDominio('A nota mínima deve ser um inteiro entre 0 e 100', 'NOTA_MINIMA_INVALIDA');
    }
    if (perfilEhAtivo(parametros.perfil) && parametros.autorizacao === undefined) {
      throw new ErroDeDominio(
        'Perfis ativos exigem autorização por escrito (responsável e referência do escopo).',
        'AUTORIZACAO_OBRIGATORIA',
      );
    }

    const etapas = etapasDoPerfil(parametros.perfil).map((nome, indice) => Etapa.criar(indice + 1, nome));
    const avaliacao = new Avaliacao(
      {
        id: parametros.id,
        organizacaoId: parametros.organizacaoId,
        sistemaId: parametros.sistemaId,
        perfil: parametros.perfil,
        notaMinima: parametros.notaMinima,
        origem: parametros.origem,
        solicitadaPor: parametros.solicitadaPor,
        solicitadaEm: agora,
        achadoRevalidadoId: parametros.achadoRevalidadoId ?? null,
      },
      parametros.autorizacao ?? null,
      parametros.permitirCriacaoDeDados ?? false,
      parametros.agenda,
      etapas,
      'RASCUNHO',
      agora,
      null,
      null,
      null,
      null,
    );

    avaliacao.registrar<AvaliacaoSolicitada>('AvaliacaoSolicitada', {
      avaliacaoId: parametros.id,
      sistemaId: parametros.sistemaId,
      perfil: parametros.perfil,
      origem: parametros.origem,
      solicitadaPor: parametros.solicitadaPor,
      sistemaVerificado: parametros.sistemaVerificado,
    }, agora);
    avaliacao.mudarPara(parametros.sistemaVerificado ? 'NA_FILA' : 'AGUARDANDO_VERIFICACAO', agora);
    return avaliacao;
  }

  static reconstituir(dados: DadosDaAvaliacao): Avaliacao {
    return new Avaliacao(
      {
        id: dados.id,
        organizacaoId: dados.organizacaoId,
        sistemaId: dados.sistemaId,
        perfil: dados.perfil,
        notaMinima: dados.notaMinima,
        origem: dados.origem,
        solicitadaPor: dados.solicitadaPor,
        solicitadaEm: dados.solicitadaEm,
        achadoRevalidadoId: dados.achadoRevalidadoId ?? null,
      },
      dados.autorizacao === undefined || dados.autorizacao === null
        ? null
        : AutorizacaoDeTeste.reconstituir(dados.autorizacao),
      dados.permitirCriacaoDeDados ?? false,
      Agenda.reconstituir(dados.agenda),
      dados.etapas.map((etapa) => Etapa.reconstituir(etapa)),
      dados.estado,
      dados.estadoDesde,
      dados.nota,
      dados.iniciadaEm,
      dados.concluidaEm,
      dados.motivoDaFalha,
    );
  }

  get id(): Identificador {
    return this.dados.id;
  }

  get organizacaoId(): Identificador {
    return this.dados.organizacaoId;
  }

  get sistemaId(): Identificador {
    return this.dados.sistemaId;
  }

  get perfil(): PerfilDeAvaliacao {
    return this.dados.perfil;
  }

  get notaMinima(): number {
    return this.dados.notaMinima;
  }

  get achadoRevalidadoId(): Identificador | null {
    return this.dados.achadoRevalidadoId ?? null;
  }

  get autorizacao(): AutorizacaoDeTeste | null {
    return this._autorizacao;
  }

  get permitirCriacaoDeDados(): boolean {
    return this._permitirCriacaoDeDados;
  }

  get estado(): EstadoDaAvaliacao {
    return this._estado;
  }

  get estadoDesde(): Date {
    return this._estadoDesde;
  }

  get nota(): number | null {
    return this._nota;
  }

  get progresso(): number {
    if (this._estado === 'CONCLUIDA') return 100;
    if (this.etapas.length === 0) return 0;
    const soma = this.etapas.reduce((total, etapa) => total + etapa.progresso, 0);
    return Math.round(soma / this.etapas.length);
  }

  get aprovada(): boolean | null {
    return this._nota === null ? null : this._nota >= this.dados.notaMinima;
  }

  liberarParaFila(agora: Date): void {
    this.mudarPara('NA_FILA', agora);
  }

  iniciarPreparacao(agora: Date): void {
    this.mudarPara('PREPARANDO', agora);
  }

  iniciarExecucao(agora: Date): void {
    this.mudarPara('EM_EXECUCAO', agora);
  }

  iniciarAnalise(agora: Date): void {
    this.mudarPara('ANALISANDO', agora);
  }

  concluir(nota: number, agora: Date): void {
    if (!Number.isFinite(nota) || nota < 0 || nota > 100) {
      throw new ErroDeDominio('A nota deve estar entre 0 e 100', 'NOTA_INVALIDA');
    }
    this.mudarPara('CONCLUIDA', agora);
    this._nota = nota;
    this.registrar<AvaliacaoConcluida>('AvaliacaoConcluida', {
      avaliacaoId: this.id,
      sistemaId: this.sistemaId,
      nota,
      aprovada: nota >= this.dados.notaMinima,
    }, agora);
  }

  falhar(motivo: string, agora: Date): void {
    this.mudarPara('FALHOU', agora);
    this._motivoDaFalha = motivo;
    this.registrar<AvaliacaoFalhou>('AvaliacaoFalhou', {
      avaliacaoId: this.id,
      sistemaId: this.sistemaId,
      motivo,
    }, agora);
  }

  cancelar(agora: Date, por: string): void {
    this.mudarPara('CANCELADA', agora);
    this.registrar<AvaliacaoCancelada>('AvaliacaoCancelada', {
      avaliacaoId: this.id,
      sistemaId: this.sistemaId,
      por,
    }, agora);
  }

  atualizarEtapa(nome: string, estado: EstadoDaEtapa, progresso: number): void {
    const etapa = this.etapas.find((candidata) => candidata.nome === nome);
    if (etapa === undefined) {
      throw new ErroDeDominio(`Etapa não encontrada: ${nome}`, 'ETAPA_NAO_ENCONTRADA');
    }
    etapa.atualizar(estado, progresso);
  }

  /** Falha a avaliação se estourou o tempo permitido no estado atual. Devolve se falhou. */
  verificarTempoLimite(agora: Date): boolean {
    const decorrido = agora.getTime() - this._estadoDesde.getTime();
    if (this._estado === 'PREPARANDO' && decorrido > TEMPO_MAXIMO_DA_PREPARACAO_MS) {
      this.falhar('Tempo máximo de preparação excedido (20 minutos)', agora);
      return true;
    }
    if (this._estado === 'EM_EXECUCAO' && decorrido > tempoMaximoDeExecucaoMs(this.perfil)) {
      this.falhar('Tempo máximo de execução excedido', agora);
      return true;
    }
    return false;
  }

  puxarEventos(): EventoDeDominio[] {
    return this.eventos.splice(0, this.eventos.length);
  }

  paraDados(): DadosDaAvaliacao {
    return {
      id: this.dados.id,
      organizacaoId: this.dados.organizacaoId,
      sistemaId: this.dados.sistemaId,
      perfil: this.dados.perfil,
      agenda: this._agenda.paraDados(),
      notaMinima: this.dados.notaMinima,
      origem: this.dados.origem,
      solicitadaPor: this.dados.solicitadaPor,
      estado: this._estado,
      estadoDesde: this._estadoDesde,
      nota: this._nota,
      etapas: this.etapas.map((etapa) => etapa.paraDados()),
      solicitadaEm: this.dados.solicitadaEm,
      iniciadaEm: this._iniciadaEm,
      concluidaEm: this._concluidaEm,
      motivoDaFalha: this._motivoDaFalha,
      achadoRevalidadoId: this.achadoRevalidadoId,
      autorizacao: this._autorizacao === null ? null : this._autorizacao.paraDados(),
      permitirCriacaoDeDados: this._permitirCriacaoDeDados,
    };
  }

  private mudarPara(novo: EstadoDaAvaliacao, agora: Date): void {
    if (!podeTransicionar(this._estado, novo)) {
      throw new ErroDeDominio(
        `Não é possível passar a avaliação de ${this._estado} para ${novo}`,
        'TRANSICAO_INVALIDA',
      );
    }
    this._estado = novo;
    this._estadoDesde = agora;
    if (novo === 'EM_EXECUCAO') this._iniciadaEm = agora;
    if (novo === 'CONCLUIDA' || novo === 'FALHOU' || novo === 'CANCELADA') this._concluidaEm = agora;
  }

  private registrar<TEvento extends EventoDeDominio>(
    tipo: TEvento['tipo'],
    dados: TEvento['dados'],
    agora: Date,
  ): void {
    this.eventos.push(criarEvento(tipo, this.organizacaoId, dados, agora));
  }
}
