import { describe, expect, it } from 'vitest';
import { WebhookDeSaida } from './WebhookDeSaida';

const AGORA = new Date('2026-01-10T12:00:00Z');

const cadastrar = (sobrescrever: Partial<{ url: string; eventos: string[] }> = {}): WebhookDeSaida =>
  WebhookDeSaida.cadastrar(
    {
      id: 'w-1',
      organizacaoId: 'org-1',
      url: 'https://ci.loja.com.br/hook',
      eventos: ['avaliacao.concluida'],
      segredo: 'segredo',
      ...sobrescrever,
    },
    AGORA,
  );

describe('WebhookDeSaida', () => {
  it('cadastra webhook ativo e emite evento', () => {
    const webhook = cadastrar();
    expect(webhook.ativo).toBe(true);
    expect(webhook.puxarEventos().map((e) => e.tipo)).toEqual(['WebhookCadastrado']);
  });

  it('exige https e URL válida', () => {
    expect(() => cadastrar({ url: 'http://ci.loja.com.br/hook' })).toThrow('https://');
    expect(() => cadastrar({ url: 'não é url' })).toThrow('inválida');
  });

  it('exige ao menos um evento, todos conhecidos', () => {
    expect(() => cadastrar({ eventos: [] })).toThrow('ao menos um evento');
    expect(() => cadastrar({ eventos: ['avaliacao.concluida', 'outro.evento'] })).toThrow(
      'outro.evento',
    );
  });

  it('escuta apenas eventos assinados e enquanto ativo', () => {
    const webhook = cadastrar({ eventos: ['achado.criado', 'achado.corrigido'] });
    expect(webhook.escutaEvento('achado.criado')).toBe(true);
    expect(webhook.escutaEvento('avaliacao.falhou')).toBe(false);
    webhook.desativar(AGORA);
    expect(webhook.escutaEvento('achado.criado')).toBe(false);
    webhook.ativar(AGORA);
    expect(webhook.escutaEvento('achado.criado')).toBe(true);
  });

  it('registra envio', () => {
    const webhook = cadastrar();
    webhook.registrarEnvio(AGORA);
    expect(webhook.paraDados().ultimoEnvioEm).toEqual(AGORA);
  });

  it('reconstitui a partir dos dados', () => {
    const webhook = cadastrar();
    expect(WebhookDeSaida.reconstituir(webhook.paraDados()).paraDados()).toEqual(webhook.paraDados());
  });
});
