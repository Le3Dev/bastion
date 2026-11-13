import { criarEvento, ErroDeDominio } from '@bastion/dominio-compartilhado';
import type { EventoDeAgendamento } from './eventos';

export type FrequenciaDaAgenda = 'DIARIA' | 'SEMANAL' | 'MENSAL';
export type PerfilDoAgendamento = 'PASSIVO' | 'PADRAO' | 'COMPLETO' | 'IA';

/** Objeto de valor: autorização por escrito para perfis ativos agendados. */
export interface AutorizacaoDoAgendamento {
  readonly responsavel: string;
  readonly referencia: string;
}

export interface DadosDoAgendamento {
  id: string;
  organizacaoId: string;
  sistemaId: string;
  perfil: PerfilDoAgendamento;
  notaMinima: number;
  frequencia: FrequenciaDaAgenda;
  horario: string;
  diaDaSemana: number | null;
  diaDoMes: number | null;
  autorizacao: AutorizacaoDoAgendamento | null;
  permitirCriacaoDeDados: boolean;
  ativo: boolean;
  criadoEm: Date;
}

export interface DadosParaCriarAgendamento {
  id: string;
  organizacaoId: string;
  sistemaId: string;
  perfil: PerfilDoAgendamento;
  notaMinima: number;
  frequencia: FrequenciaDaAgenda;
  horario: string;
  diaDaSemana?: number | null;
  diaDoMes?: number | null;
  autorizacao?: { responsavel: string; referencia: string } | null;
  permitirCriacaoDeDados: boolean;
}

const FORMATO_DO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Agregado raiz: execução recorrente de avaliações de um sistema. */
export class AgendamentoDeAvaliacao {
  private eventos: EventoDeAgendamento[] = [];

  private constructor(private dados: DadosDoAgendamento) {}

  static criar(entrada: DadosParaCriarAgendamento, agora: Date): AgendamentoDeAvaliacao {
    if (!FORMATO_DO_HORARIO.test(entrada.horario)) {
      throw new ErroDeDominio('O horário deve estar no formato HH:MM.', 'HORARIO_INVALIDO');
    }
    if (
      !Number.isInteger(entrada.notaMinima) ||
      entrada.notaMinima < 0 ||
      entrada.notaMinima > 100
    ) {
      throw new ErroDeDominio('A nota mínima deve ser um inteiro entre 0 e 100.', 'NOTA_INVALIDA');
    }
    const diaDaSemana = entrada.diaDaSemana ?? null;
    const diaDoMes = entrada.diaDoMes ?? null;
    if (entrada.frequencia === 'SEMANAL') {
      if (diaDaSemana === null || !Number.isInteger(diaDaSemana) || diaDaSemana < 0 || diaDaSemana > 6) {
        throw new ErroDeDominio('Informe o dia da semana (0 a 6).', 'DIA_DA_SEMANA_INVALIDO');
      }
    }
    if (entrada.frequencia === 'MENSAL') {
      if (diaDoMes === null || !Number.isInteger(diaDoMes) || diaDoMes < 1 || diaDoMes > 28) {
        throw new ErroDeDominio('Informe o dia do mês (1 a 28).', 'DIA_DO_MES_INVALIDO');
      }
    }
    let autorizacao: AutorizacaoDoAgendamento | null = null;
    if (entrada.autorizacao !== undefined && entrada.autorizacao !== null) {
      const responsavel = entrada.autorizacao.responsavel.trim();
      const referencia = entrada.autorizacao.referencia.trim();
      if (responsavel !== '' && referencia !== '') {
        autorizacao = Object.freeze({ responsavel, referencia });
      }
    }
    if (entrada.perfil !== 'PASSIVO' && autorizacao === null) {
      throw new ErroDeDominio(
        'Perfis ativos exigem a autorização por escrito (responsável e referência).',
        'AUTORIZACAO_OBRIGATORIA',
      );
    }
    const agendamento = new AgendamentoDeAvaliacao({
      id: entrada.id,
      organizacaoId: entrada.organizacaoId,
      sistemaId: entrada.sistemaId,
      perfil: entrada.perfil,
      notaMinima: entrada.notaMinima,
      frequencia: entrada.frequencia,
      horario: entrada.horario,
      diaDaSemana: entrada.frequencia === 'SEMANAL' ? diaDaSemana : null,
      diaDoMes: entrada.frequencia === 'MENSAL' ? diaDoMes : null,
      autorizacao,
      permitirCriacaoDeDados: entrada.permitirCriacaoDeDados,
      ativo: true,
      criadoEm: agora,
    });
    agendamento.eventos.push(
      criarEvento('AgendamentoCriado', entrada.organizacaoId, {
        agendamentoId: entrada.id,
        sistemaId: entrada.sistemaId,
        frequencia: entrada.frequencia,
      }, agora),
    );
    return agendamento;
  }

  static reconstituir(dados: DadosDoAgendamento): AgendamentoDeAvaliacao {
    return new AgendamentoDeAvaliacao({
      ...dados,
      autorizacao: dados.autorizacao === null ? null : Object.freeze({ ...dados.autorizacao }),
    });
  }

  get id(): string {
    return this.dados.id;
  }
  get organizacaoId(): string {
    return this.dados.organizacaoId;
  }
  get sistemaId(): string {
    return this.dados.sistemaId;
  }
  get perfil(): PerfilDoAgendamento {
    return this.dados.perfil;
  }
  get notaMinima(): number {
    return this.dados.notaMinima;
  }
  get frequencia(): FrequenciaDaAgenda {
    return this.dados.frequencia;
  }
  get horario(): string {
    return this.dados.horario;
  }
  get diaDaSemana(): number | null {
    return this.dados.diaDaSemana;
  }
  get diaDoMes(): number | null {
    return this.dados.diaDoMes;
  }
  get autorizacao(): AutorizacaoDoAgendamento | null {
    return this.dados.autorizacao;
  }
  get permitirCriacaoDeDados(): boolean {
    return this.dados.permitirCriacaoDeDados;
  }
  get ativo(): boolean {
    return this.dados.ativo;
  }
  get criadoEm(): Date {
    return this.dados.criadoEm;
  }

  pausar(agora: Date): void {
    if (!this.dados.ativo) return;
    this.dados.ativo = false;
    this.eventos.push(
      criarEvento('AgendamentoPausado', this.dados.organizacaoId, { agendamentoId: this.dados.id }, agora),
    );
  }

  retomar(agora: Date): void {
    if (this.dados.ativo) return;
    this.dados.ativo = true;
    this.eventos.push(
      criarEvento('AgendamentoRetomado', this.dados.organizacaoId, { agendamentoId: this.dados.id }, agora),
    );
  }

  paraDados(): DadosDoAgendamento {
    return {
      ...this.dados,
      autorizacao: this.dados.autorizacao === null ? null : { ...this.dados.autorizacao },
    };
  }

  puxarEventos(): EventoDeAgendamento[] {
    const pendentes = this.eventos;
    this.eventos = [];
    return pendentes;
  }
}
