import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assinarCorpo, assinaturaConfere } from './assinatura-de-webhook';

describe('assinatura de webhook', () => {
  const segredo = 'whsec_teste';
  const corpo = JSON.stringify({ id: '1', tipo: 'avaliacao.concluida' });

  it('assina com HMAC-SHA256 no formato sha256=<hex>, de forma determinística', () => {
    const esperada = `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
    expect(assinarCorpo(segredo, corpo)).toBe(esperada);
    expect(assinarCorpo(segredo, corpo)).toBe(assinarCorpo(segredo, corpo));
  });

  it('muda a assinatura quando o corpo ou o segredo mudam', () => {
    expect(assinarCorpo(segredo, corpo + ' ')).not.toBe(assinarCorpo(segredo, corpo));
    expect(assinarCorpo('outro', corpo)).not.toBe(assinarCorpo(segredo, corpo));
  });

  it('verifica a assinatura e recusa a adulterada', () => {
    const assinatura = assinarCorpo(segredo, corpo);
    expect(assinaturaConfere(segredo, corpo, assinatura)).toBe(true);
    expect(assinaturaConfere(segredo, corpo, 'sha256=00')).toBe(false);
    expect(assinaturaConfere(segredo, corpo + 'x', assinatura)).toBe(false);
  });
});
