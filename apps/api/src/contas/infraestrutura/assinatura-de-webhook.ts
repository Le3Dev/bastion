import { createHmac, timingSafeEqual } from 'node:crypto';

/** Assina o corpo com HMAC-SHA256 e devolve `sha256=<hex>`. */
export const assinarCorpo = (segredo: string, corpo: string): string =>
  `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;

/** Verifica a assinatura em tempo constante (usada por quem recebe o webhook e nos testes). */
export const assinaturaConfere = (segredo: string, corpo: string, assinatura: string): boolean => {
  const esperada = Buffer.from(assinarCorpo(segredo, corpo), 'utf8');
  const recebida = Buffer.from(assinatura, 'utf8');
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
};
