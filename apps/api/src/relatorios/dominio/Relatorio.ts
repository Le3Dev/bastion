import {
  ErroDeDominio,
  SEVERIDADES,
  criarEvento,
  type EventoDeDominio,
  type Identificador,
  type Severidade,
} from '@bastion/dominio-compartilhado';
import { estaEmAberto, type EstadoDoAchado } from '../../achados/dominio/EstadoDoAchado';
import { MapeamentoDeConformidade, type ContagemDeCodigo } from './MapeamentoDeConformidade';
import { NotaDeSeguranca } from './NotaDeSeguranca';
import type { RelatorioGerado } from './eventos';

export interface AchadoDoRelatorio {
  readonly id: Identificador;
  readonly titulo: string;
  readonly severidade: Severidade;
  readonly estado: EstadoDoAchado;
  readonly conformidade: { readonly owasp: readonly string[]; readonly lgpd: readonly string[] };
}

export interface DadosDoRelatorio {
  readonly id: Identificador;
  readonly organizacaoId: Identificador;
  readonly avaliacaoId: Identificador;
  readonly sistemaId: Identificador;
  readonly sistemaNome: string;
  readonly notaMinima: number;
  readonly nota: number;
  readonly aprovado: boolean;
  readonly resumo: string;
  /** Contagem dos achados em aberto por severidade (os mesmos que entram na nota). */
  readonly contagemPorSeveridade: Readonly<Record<Severidade, number>>;
  readonly conformidade: {
    readonly owasp: readonly ContagemDeCodigo[];
    readonly lgpd: readonly ContagemDeCodigo[];
  };
  readonly achados: readonly AchadoDoRelatorio[];
  readonly geradoEm: Date;
}

export interface ParametrosDeGeracao {
  readonly id: Identificador;
  readonly organizacaoId: Identificador;
  readonly avaliacaoId: Identificador;
  readonly sistemaId: Identificador;
  readonly sistemaNome: string;
  readonly notaMinima: number;
  readonly achados: readonly AchadoDoRelatorio[];
}

const ROTULO_DA_FAIXA = { BOA: 'boa', ATENCAO: 'de atenção', CRITICA: 'crítica' } as const;

const ROTULO_DA_SEVERIDADE: Readonly<Record<Severidade, readonly [string, string]>> = {
  CRITICA: ['crítico', 'críticos'],
  ALTA: ['de severidade alta', 'de severidade alta'],
  MEDIA: ['de severidade média', 'de severidade média'],
  BAIXA: ['de severidade baixa', 'de severidade baixa'],
};

const contarPorSeveridade = (achados: readonly AchadoDoRelatorio[]): Record<Severidade, number> => {
  const contagem: Record<Severidade, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 };
  for (const achado of achados) {
    if (estaEmAberto(achado.estado)) contagem[achado.severidade] += 1;
  }
  return contagem;
};

const gerarResumo = (
  sistemaNome: string,
  nota: NotaDeSeguranca,
  notaMinima: number,
  aprovado: boolean,
  contagem: Readonly<Record<Severidade, number>>,
): string => {
  const situacao = aprovado
    ? `aprovado, pois atingiu a nota mínima de ${notaMinima}`
    : `reprovado, pois ficou abaixo da nota mínima de ${notaMinima}`;
  const partes = SEVERIDADES.filter((severidade) => contagem[severidade] > 0).map((severidade) => {
    const quantidade = contagem[severidade];
    const [singular, plural] = ROTULO_DA_SEVERIDADE[severidade];
    return `${quantidade} ${quantidade === 1 ? singular : plural}`;
  });
  const total = SEVERIDADES.reduce((soma, severidade) => soma + contagem[severidade], 0);
  const achados =
    total === 0
      ? 'Nenhum achado em aberto.'
      : `${total === 1 ? 'Achado em aberto' : 'Achados em aberto'} (${total}): ${partes.join(', ')}.`;
  return `O sistema ${sistemaNome} recebeu nota ${nota.valor} (faixa ${ROTULO_DA_FAIXA[nota.faixa]}) e foi ${situacao}. ${achados}`;
};

/** Agregado raiz: retrato imutável do resultado de uma avaliação concluída. */
export class Relatorio {
  private readonly eventos: EventoDeDominio[] = [];

  private constructor(private readonly dados: DadosDoRelatorio) {}

  static gerar(parametros: ParametrosDeGeracao, agora: Date): Relatorio {
    if (!Number.isInteger(parametros.notaMinima) || parametros.notaMinima < 0 || parametros.notaMinima > 100) {
      throw new ErroDeDominio('A nota mínima deve ser um inteiro entre 0 e 100', 'NOTA_MINIMA_INVALIDA');
    }
    const nota = NotaDeSeguranca.calcular(parametros.achados);
    const aprovado = nota.valor >= parametros.notaMinima;
    const contagem = contarPorSeveridade(parametros.achados);
    const mapeamento = MapeamentoDeConformidade.agregar(parametros.achados);

    const relatorio = new Relatorio({
      id: parametros.id,
      organizacaoId: parametros.organizacaoId,
      avaliacaoId: parametros.avaliacaoId,
      sistemaId: parametros.sistemaId,
      sistemaNome: parametros.sistemaNome,
      notaMinima: parametros.notaMinima,
      nota: nota.valor,
      aprovado,
      resumo: gerarResumo(parametros.sistemaNome, nota, parametros.notaMinima, aprovado, contagem),
      contagemPorSeveridade: contagem,
      conformidade: mapeamento.paraDados(),
      achados: parametros.achados.map((achado) => ({ ...achado })),
      geradoEm: agora,
    });
    relatorio.eventos.push(
      criarEvento<'RelatorioGerado', RelatorioGerado['dados']>(
        'RelatorioGerado',
        parametros.organizacaoId,
        {
          relatorioId: parametros.id,
          avaliacaoId: parametros.avaliacaoId,
          sistemaId: parametros.sistemaId,
          nota: nota.valor,
          aprovado,
        },
        agora,
      ),
    );
    return relatorio;
  }

  static reconstituir(dados: DadosDoRelatorio): Relatorio {
    return new Relatorio(dados);
  }

  get id(): Identificador {
    return this.dados.id;
  }

  get organizacaoId(): Identificador {
    return this.dados.organizacaoId;
  }

  get nota(): NotaDeSeguranca {
    return NotaDeSeguranca.reconstituir(this.dados.nota);
  }

  get aprovado(): boolean {
    return this.dados.aprovado;
  }

  get resumo(): string {
    return this.dados.resumo;
  }

  puxarEventos(): EventoDeDominio[] {
    return this.eventos.splice(0, this.eventos.length);
  }

  paraDados(): DadosDoRelatorio {
    return { ...this.dados, achados: this.dados.achados.map((achado) => ({ ...achado })) };
  }
}
