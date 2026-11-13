import { describe, expect, it } from 'vitest';
import { criarServicoDeEmail, criarServicoDeEmailFalso, montarEmailDeConvite } from './email';

const msg = { para: 'a@b.com', assunto: 'x', html: '<p>x</p>', texto: 'x' };

describe('serviço de e-mail', () => {
  it('sem configuração, vira no-op e não lança', async () => {
    const logs: string[] = [];
    const servico = criarServicoDeEmail(null, (m) => logs.push(m));
    expect(await servico.enviar(msg)).toEqual({ enviado: false, motivo: 'SMTP não configurado' });
    expect(logs[0]).toContain('e-mail não configurado');
  });

  it('monta o convite com link, papel e organização', () => {
    const r = montarEmailDeConvite({
      nomeDaOrganizacao: 'Acme <X>',
      papel: 'analista',
      linkDoConvite: 'http://localhost:3000/convite?token=abc',
    });
    expect(r.texto).toContain('http://localhost:3000/convite?token=abc');
    expect(r.texto).toContain('analista');
    expect(r.html).toContain('token=abc');
    expect(r.html).toContain('Acme &lt;X&gt;');
    expect(r.assunto).toContain('Acme');
  });

  it('o falso guarda as mensagens enviadas', async () => {
    const falso = criarServicoDeEmailFalso();
    expect(await falso.enviar(msg)).toEqual({ enviado: true });
    expect(falso.enviadas).toEqual([msg]);
  });
});
