import type { EventoDeDominio } from '@bastion/dominio-compartilhado';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Banco, Transacao } from '../banco/conexao';
import { eventosDeSaida } from '../banco/tabelas';
import type { Relogio } from '../relogio';

export interface EventoDoOutbox {
  id: string;
  tipo: string;
  organizacaoId: string;
  ocorridoEm: Date;
  dados: Record<string, unknown>;
}

export type ManipuladorDoOutbox = (evento: EventoDoOutbox) => Promise<void>;

const manipuladores = new Map<string, Map<string, ManipuladorDoOutbox>>();

/**
 * Registra um manipulador para os eventos de domínio de um `tipo`.
 * A mesma `chave` substitui o registro anterior, o que torna o registro idempotente.
 */
export const registrarManipuladorDoOutbox = (
  tipo: string,
  fn: ManipuladorDoOutbox,
  chave = 'padrao',
): void => {
  const porChave = manipuladores.get(tipo) ?? new Map<string, ManipuladorDoOutbox>();
  porChave.set(chave, fn);
  manipuladores.set(tipo, porChave);
};

/** Grava os eventos de domínio no outbox, na MESMA transação do caso de uso. */
export const registrarNoOutbox = async (
  tx: Transacao,
  eventos: readonly EventoDeDominio[],
): Promise<void> => {
  if (eventos.length === 0) return;
  await tx.insert(eventosDeSaida).values(
    eventos.map((evento) => ({
      id: evento.id,
      organizacaoId: evento.organizacaoId,
      tipo: evento.tipo,
      dados: evento.dados as Record<string, unknown>,
      ocorridoEm: evento.ocorridoEm,
    })),
  );
};

const LOTE = 50;
const INTERVALO_EM_MS = 1000;
const MAXIMO_DE_TENTATIVAS = 10;

export class PublicadorDoOutbox {
  private temporizador: NodeJS.Timeout | null = null;
  private rodando = false;
  private emExecucao: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: Banco,
    private readonly relogio: Relogio,
    private readonly registrarErro: (mensagem: string, erro: unknown) => void = (mensagem, erro) =>
      console.error(mensagem, erro),
  ) {}

  iniciar(): void {
    if (this.rodando) return;
    this.rodando = true;
    const agendar = (): void => {
      if (!this.rodando) return;
      this.temporizador = setTimeout(() => {
        this.emExecucao = this.publicarPendentes()
          .catch((erro: unknown) => this.registrarErro('Falha ao publicar o outbox.', erro))
          .finally(agendar);
      }, INTERVALO_EM_MS);
    };
    agendar();
  }

  async parar(): Promise<void> {
    this.rodando = false;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    await this.emExecucao;
  }

  /** Lê até 50 eventos não publicados e chama os manipuladores. Devolve quantos foram publicados. */
  async publicarPendentes(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const pendentes = await tx
        .select()
        .from(eventosDeSaida)
        .where(
          and(isNull(eventosDeSaida.publicadoEm), lt(eventosDeSaida.tentativas, MAXIMO_DE_TENTATIVAS)),
        )
        .orderBy(eventosDeSaida.ocorridoEm)
        .limit(LOTE)
        .for('update', { skipLocked: true });

      let publicados = 0;
      for (const linha of pendentes) {
        const evento: EventoDoOutbox = {
          id: linha.id,
          tipo: linha.tipo,
          organizacaoId: linha.organizacaoId,
          ocorridoEm: linha.ocorridoEm,
          dados: linha.dados,
        };
        try {
          for (const fn of manipuladores.get(linha.tipo)?.values() ?? []) {
            await fn(evento);
          }
          await tx
            .update(eventosDeSaida)
            .set({ publicadoEm: this.relogio.agora() })
            .where(eq(eventosDeSaida.id, linha.id));
          publicados++;
        } catch (erro) {
          this.registrarErro(`Falha ao publicar o evento ${linha.tipo} (${linha.id}).`, erro);
          await tx
            .update(eventosDeSaida)
            .set({ tentativas: sql`${eventosDeSaida.tentativas} + 1` })
            .where(eq(eventosDeSaida.id, linha.id));
        }
      }
      return publicados;
    });
  }
}
