import { randomUUID } from 'node:crypto';
import { EventoDeResultado } from '@bastion/contratos';

type OmitirDeUniao<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Evento sem a identidade e o instante, que o publicador preenche. */
export type DadosDoEvento = OmitirDeUniao<EventoDeResultado, 'idDoEvento' | 'em'>;

/** Parte da fila BullMQ que o publicador usa (facilita o teste). */
export interface FilaDeResultados {
  add(nome: string, dados: EventoDeResultado, opcoes: { jobId: string }): Promise<unknown>;
}

export interface OpcoesDoPublicador {
  gerarId?: () => string;
  agora?: () => Date;
}

/** Publica eventos na fila `resultados`; a API consome de forma idempotente pelo `idDoEvento`. */
export class PublicadorDeResultados {
  private readonly gerarId: () => string;
  private readonly agora: () => Date;

  constructor(
    private readonly fila: FilaDeResultados,
    opcoes: OpcoesDoPublicador = {},
  ) {
    this.gerarId = opcoes.gerarId ?? randomUUID;
    this.agora = opcoes.agora ?? (() => new Date());
  }

  async publicar(dados: DadosDoEvento): Promise<EventoDeResultado> {
    const analise = EventoDeResultado.safeParse({
      ...dados,
      idDoEvento: this.gerarId(),
      em: this.agora().toISOString(),
    });
    if (!analise.success) {
      const detalhe = analise.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.message}`).join('; ');
      throw new Error(`Evento de resultado inválido (${dados.tipo}): ${detalhe}.`);
    }
    const evento = analise.data;
    try {
      await this.fila.add(evento.tipo, evento, { jobId: evento.idDoEvento });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : 'erro desconhecido';
      throw new Error(`Não foi possível publicar o evento ${evento.tipo} na fila de resultados: ${motivo}.`);
    }
    return evento;
  }
}
