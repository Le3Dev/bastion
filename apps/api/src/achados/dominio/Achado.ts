import {
  ErroDeDominio,
  ImpressaoDigital,
  criarEvento,
  type EventoDeDominio,
  type Identificador,
  type Severidade,
} from '@bastion/dominio-compartilhado';
import type { DadosDaConstatacao } from './DadosDaConstatacao';
import { podeTransicionarAchado, transicoesPossiveis, type EstadoDoAchado } from './EstadoDoAchado';
import { Evidencia, type DadosDaEvidencia } from './Evidencia';
import { HistoricoDoAchado, type DadosDoHistorico } from './HistoricoDoAchado';
import { RiscoAceito, type DadosDoRiscoAceito } from './RiscoAceito';
import type { AchadoCorrigido, AchadoCriado, AchadoReaberto } from './eventos';

export const ATOR_SISTEMA = 'Sistema';

export interface DadosDoAchado {
  readonly id: Identificador;
  readonly organizacaoId: Identificador;
  readonly sistemaId: Identificador;
  readonly impressaoDigital: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly severidade: Severidade;
  readonly local: string;
  readonly descricao: string;
  readonly evidencia: DadosDaEvidencia;
  readonly correcaoSugerida: string;
  readonly conformidade: { readonly owasp: readonly string[]; readonly lgpd: readonly string[] };
  readonly estado: EstadoDoAchado;
  readonly ocorrencias: number;
  readonly avaliacaoIds: readonly Identificador[];
  readonly primeiraVezEm: Date;
  readonly ultimaVezEm: Date;
  readonly riscoAceito: DadosDoRiscoAceito | null;
  readonly historico: readonly DadosDoHistorico[];
}

export interface ParametrosDeDeteccao {
  readonly id: Identificador;
  readonly organizacaoId: Identificador;
  readonly sistemaId: Identificador;
  readonly avaliacaoId: Identificador;
  readonly constatacao: DadosDaConstatacao;
}

export interface OpcoesDeMudancaDeEstado {
  readonly ator: string;
  readonly comentario?: string;
  readonly riscoAceito?: RiscoAceito;
}

/** Agregado raiz do contexto de achados. */
export class Achado {
  private readonly eventos: EventoDeDominio[] = [];
  private readonly avaliacaoIds: Identificador[];
  private readonly historico: HistoricoDoAchado[];
  private _estado: EstadoDoAchado;
  private _ocorrencias: number;
  private _ultimaVezEm: Date;
  private _riscoAceito: RiscoAceito | null;

  private constructor(
    private readonly dados: Omit<
      DadosDoAchado,
      'estado' | 'ocorrencias' | 'avaliacaoIds' | 'ultimaVezEm' | 'riscoAceito' | 'historico' | 'evidencia'
    >,
    private readonly _evidencia: Evidencia,
    estado: EstadoDoAchado,
    ocorrencias: number,
    avaliacaoIds: Identificador[],
    ultimaVezEm: Date,
    riscoAceito: RiscoAceito | null,
    historico: HistoricoDoAchado[],
  ) {
    this._estado = estado;
    this._ocorrencias = ocorrencias;
    this.avaliacaoIds = avaliacaoIds;
    this._ultimaVezEm = ultimaVezEm;
    this._riscoAceito = riscoAceito;
    this.historico = historico;
  }

  static detectar(parametros: ParametrosDeDeteccao, agora: Date): Achado {
    const { constatacao } = parametros;
    const achado = new Achado(
      {
        id: parametros.id,
        organizacaoId: parametros.organizacaoId,
        sistemaId: parametros.sistemaId,
        impressaoDigital: ImpressaoDigital.de(parametros.sistemaId, constatacao.tipo, constatacao.local).valor,
        tipo: constatacao.tipo,
        titulo: constatacao.titulo,
        severidade: constatacao.severidade,
        local: constatacao.local,
        descricao: constatacao.descricao,
        correcaoSugerida: constatacao.correcaoSugerida,
        conformidade: {
          owasp: [...constatacao.conformidade.owasp],
          lgpd: [...constatacao.conformidade.lgpd],
        },
        primeiraVezEm: agora,
      },
      Evidencia.criar(constatacao.evidencia),
      'NOVO',
      1,
      [parametros.avaliacaoId],
      agora,
      null,
      [HistoricoDoAchado.criar({ em: agora, de: null, para: 'NOVO', ator: ATOR_SISTEMA, comentario: null })],
    );
    achado.registrar<AchadoCriado>('AchadoCriado', {
      achadoId: parametros.id,
      sistemaId: parametros.sistemaId,
      avaliacaoId: parametros.avaliacaoId,
      tipo: constatacao.tipo,
      titulo: constatacao.titulo,
      severidade: constatacao.severidade,
      local: constatacao.local,
    }, agora);
    return achado;
  }

  static reconstituir(dados: DadosDoAchado): Achado {
    return new Achado(
      {
        id: dados.id,
        organizacaoId: dados.organizacaoId,
        sistemaId: dados.sistemaId,
        impressaoDigital: dados.impressaoDigital,
        tipo: dados.tipo,
        titulo: dados.titulo,
        severidade: dados.severidade,
        local: dados.local,
        descricao: dados.descricao,
        correcaoSugerida: dados.correcaoSugerida,
        conformidade: dados.conformidade,
        primeiraVezEm: dados.primeiraVezEm,
      },
      Evidencia.reconstituir(dados.evidencia),
      dados.estado,
      dados.ocorrencias,
      [...dados.avaliacaoIds],
      dados.ultimaVezEm,
      dados.riscoAceito === null ? null : RiscoAceito.reconstituir(dados.riscoAceito),
      dados.historico.map((entrada) => HistoricoDoAchado.criar(entrada)),
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

  get impressaoDigital(): string {
    return this.dados.impressaoDigital;
  }

  get severidade(): Severidade {
    return this.dados.severidade;
  }

  get estado(): EstadoDoAchado {
    return this._estado;
  }

  get ocorrencias(): number {
    return this._ocorrencias;
  }

  get riscoAceito(): RiscoAceito | null {
    return this._riscoAceito;
  }

  get transicoesPossiveis(): readonly EstadoDoAchado[] {
    return transicoesPossiveis(this._estado);
  }

  /** Soma uma ocorrência (uma vez por avaliação). Reabre o achado se estava corrigido. */
  registrarNovaOcorrencia(avaliacaoId: Identificador, agora: Date): void {
    if (this.avaliacaoIds.includes(avaliacaoId)) return;
    this.avaliacaoIds.push(avaliacaoId);
    this._ocorrencias += 1;
    this._ultimaVezEm = agora;
    if (this._estado === 'CORRIGIDO') {
      this.mudarPara(
        'REABERTO',
        ATOR_SISTEMA,
        `Problema encontrado novamente na avaliação ${avaliacaoId}`,
        agora,
      );
    }
  }

  confirmar(ator: string, comentario: string | null, agora: Date): void {
    this.mudarPara('CONFIRMADO', ator, comentario, agora);
  }

  iniciarCorrecao(ator: string, comentario: string | null, agora: Date): void {
    this.mudarPara('EM_CORRECAO', ator, comentario, agora);
  }

  solicitarRevalidacao(ator: string, comentario: string | null, agora: Date): void {
    this.mudarPara('REVALIDANDO', ator, comentario, agora);
  }

  aceitarRisco(risco: RiscoAceito, ator: string, comentario: string | null, agora: Date): void {
    this.mudarPara('RISCO_ACEITO', ator, comentario, agora);
    this._riscoAceito = risco;
  }

  reabrir(ator: string, comentario: string | null, agora: Date): void {
    this.mudarPara('REABERTO', ator, comentario, agora);
  }

  concluirRevalidacao(encontradoNovamente: boolean, ator: string, agora: Date): void {
    if (encontradoNovamente) {
      this.mudarPara('REABERTO', ator, 'Revalidação encontrou o problema novamente', agora);
    } else {
      this.mudarPara('CORRIGIDO', ator, 'Revalidação não encontrou o problema', agora);
    }
  }

  mudarEstado(para: EstadoDoAchado, opcoes: OpcoesDeMudancaDeEstado, agora: Date): void {
    const comentario = opcoes.comentario ?? null;
    switch (para) {
      case 'CONFIRMADO':
        return this.confirmar(opcoes.ator, comentario, agora);
      case 'EM_CORRECAO':
        return this.iniciarCorrecao(opcoes.ator, comentario, agora);
      case 'REVALIDANDO':
        return this.solicitarRevalidacao(opcoes.ator, comentario, agora);
      case 'REABERTO':
        return this.reabrir(opcoes.ator, comentario, agora);
      case 'CORRIGIDO':
        return this.concluirRevalidacao(false, opcoes.ator, agora);
      case 'RISCO_ACEITO':
        if (opcoes.riscoAceito === undefined) {
          throw new ErroDeDominio(
            'Informe justificativa, responsável e validade para aceitar o risco',
            'RISCO_ACEITO_OBRIGATORIO',
          );
        }
        return this.aceitarRisco(opcoes.riscoAceito, opcoes.ator, comentario, agora);
      case 'NOVO':
        throw new ErroDeDominio(
          `Não é possível passar o achado de ${this._estado} para NOVO`,
          'TRANSICAO_INVALIDA',
        );
    }
  }

  /** Se o aceite de risco venceu, volta o achado para CONFIRMADO. Devolve se mudou. */
  verificarVencimentoDoRisco(agora: Date): boolean {
    if (this._estado !== 'RISCO_ACEITO' || this._riscoAceito === null) return false;
    if (!this._riscoAceito.venceuEm(agora)) return false;
    this.mudarPara('CONFIRMADO', ATOR_SISTEMA, 'Aceite de risco vencido', agora);
    return true;
  }

  puxarEventos(): EventoDeDominio[] {
    return this.eventos.splice(0, this.eventos.length);
  }

  paraDados(): DadosDoAchado {
    return {
      id: this.dados.id,
      organizacaoId: this.dados.organizacaoId,
      sistemaId: this.dados.sistemaId,
      impressaoDigital: this.dados.impressaoDigital,
      tipo: this.dados.tipo,
      titulo: this.dados.titulo,
      severidade: this.dados.severidade,
      local: this.dados.local,
      descricao: this.dados.descricao,
      evidencia: this._evidencia.paraDados(),
      correcaoSugerida: this.dados.correcaoSugerida,
      conformidade: this.dados.conformidade,
      estado: this._estado,
      ocorrencias: this._ocorrencias,
      avaliacaoIds: [...this.avaliacaoIds],
      primeiraVezEm: this.dados.primeiraVezEm,
      ultimaVezEm: this._ultimaVezEm,
      riscoAceito: this._riscoAceito === null ? null : this._riscoAceito.paraDados(),
      historico: this.historico.map((entrada) => entrada.paraDados()),
    };
  }

  private mudarPara(novo: EstadoDoAchado, ator: string, comentario: string | null, agora: Date): void {
    const anterior = this._estado;
    if (!podeTransicionarAchado(anterior, novo)) {
      throw new ErroDeDominio(
        `Não é possível passar o achado de ${anterior} para ${novo}`,
        'TRANSICAO_INVALIDA',
      );
    }
    this._estado = novo;
    if (anterior === 'RISCO_ACEITO') this._riscoAceito = null;
    this.historico.push(HistoricoDoAchado.criar({ em: agora, de: anterior, para: novo, ator, comentario }));
    const identificacao = { achadoId: this.id, sistemaId: this.sistemaId, ator };
    if (novo === 'REABERTO') this.registrar<AchadoReaberto>('AchadoReaberto', identificacao, agora);
    if (novo === 'CORRIGIDO') this.registrar<AchadoCorrigido>('AchadoCorrigido', identificacao, agora);
  }

  private registrar<TEvento extends EventoDeDominio>(
    tipo: TEvento['tipo'],
    dados: TEvento['dados'],
    agora: Date,
  ): void {
    this.eventos.push(criarEvento(tipo, this.organizacaoId, dados, agora));
  }
}
