import type { EventoAoVivo } from '@bastion/contratos';
import { Redis } from 'ioredis';

export const canalAoVivo = (avaliacaoId: string): string => `bastion:ao-vivo:${avaliacaoId}`;

export type OuvinteAoVivo = (evento: EventoAoVivo) => void;

/** Cancela a assinatura de uma avaliação. */
export type CancelarAssinatura = () => Promise<void>;

/**
 * Pub/sub do acompanhamento ao vivo de uma avaliação (SSE). A publicação é "melhor esforço":
 * quem publica trata a falha, pois o estado já foi gravado no banco.
 */
export interface AoVivo {
  publicarAoVivo(avaliacaoId: string, evento: EventoAoVivo): Promise<void>;
  /** Resolve quando a assinatura já está ativa (nenhum evento posterior se perde). */
  assinar(avaliacaoId: string, ouvinte: OuvinteAoVivo): Promise<CancelarAssinatura>;
  fechar(): Promise<void>;
}

const ehEventoAoVivo = (valor: unknown): valor is EventoAoVivo =>
  typeof valor === 'object' &&
  valor !== null &&
  'tipo' in valor &&
  typeof (valor as { tipo: unknown }).tipo === 'string' &&
  'dados' in valor;

/**
 * Implementação sobre o Redis: uma conexão para publicar e outra, dedicada, para assinar
 * (uma conexão em modo de assinatura não aceita outros comandos). Uma única assinatura por
 * canal no Redis atende a todos os ouvintes locais.
 */
export const criarAoVivo = (redisUrl: string): AoVivo => {
  const publicador = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  const assinante = new Redis(redisUrl, { maxRetriesPerRequest: null });
  publicador.on('error', () => undefined);
  assinante.on('error', () => undefined);

  const ouvintesPorCanal = new Map<string, Set<OuvinteAoVivo>>();

  assinante.on('message', (canal: string, mensagem: string) => {
    const ouvintes = ouvintesPorCanal.get(canal);
    if (!ouvintes) return;
    let evento: unknown;
    try {
      evento = JSON.parse(mensagem);
    } catch {
      return;
    }
    if (!ehEventoAoVivo(evento)) return;
    for (const ouvinte of [...ouvintes]) {
      try {
        ouvinte(evento);
      } catch {
        // Um ouvinte com defeito não pode impedir os demais.
      }
    }
  });

  return {
    async publicarAoVivo(avaliacaoId, evento) {
      await publicador.publish(canalAoVivo(avaliacaoId), JSON.stringify(evento));
    },

    async assinar(avaliacaoId, ouvinte) {
      const canal = canalAoVivo(avaliacaoId);
      let ouvintes = ouvintesPorCanal.get(canal);
      const primeiro = ouvintes === undefined;
      if (ouvintes === undefined) {
        ouvintes = new Set();
        ouvintesPorCanal.set(canal, ouvintes);
      }
      ouvintes.add(ouvinte);
      if (primeiro) {
        try {
          await assinante.subscribe(canal);
        } catch (erro) {
          ouvintesPorCanal.delete(canal);
          throw erro;
        }
      }
      return async () => {
        const atuais = ouvintesPorCanal.get(canal);
        if (!atuais) return;
        atuais.delete(ouvinte);
        if (atuais.size === 0) {
          ouvintesPorCanal.delete(canal);
          await assinante.unsubscribe(canal).catch(() => undefined);
        }
      };
    },

    async fechar() {
      assinante.disconnect();
      publicador.disconnect();
      ouvintesPorCanal.clear();
    },
  };
};
