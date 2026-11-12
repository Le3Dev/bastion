import { describe, expect, it } from 'vitest';
import { analisarCabecalhos, analisarCookies, analisarExposicaoDeVersao, analisarRespostaPassiva, analisarTls } from './index';
import type { DadosDoTls, RespostaColetada } from './tipos';

const BEM_CONFIGURADO: RespostaColetada = {
  url: 'https://hml.exemplo-loja.net/',
  metodo: 'GET',
  status: 200,
  cabecalhos: {
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=()',
    server: 'nginx',
    'set-cookie': 'sessao=abc; Path=/; Secure; HttpOnly; SameSite=Lax',
  },
};

const comCabecalhos = (
  cabecalhos: RespostaColetada['cabecalhos'],
  url = 'https://hml.exemplo-loja.net/',
): RespostaColetada => ({ url, metodo: 'GET', status: 200, cabecalhos });

const tipos = (r: { tipo: string }[]): string[] => r.map((c) => c.tipo);

describe('analisarRespostaPassiva', () => {
  it('site bem configurado gera zero constatações', () => {
    expect(analisarRespostaPassiva(BEM_CONFIGURADO)).toEqual([]);
  });

  it('site mal configurado gera as constatações esperadas', () => {
    const resposta = comCabecalhos(
      {
        server: 'Apache/2.4.41 (Ubuntu)',
        'x-powered-by': 'Express',
        'set-cookie': 'PHPSESSID=xyz; Path=/',
      },
      'https://hml.exemplo-loja.net/',
    );
    expect(tipos(analisarRespostaPassiva(resposta)).sort()).toEqual(
      [
        'CABECALHO_CSP_AUSENTE',
        'CABECALHO_HSTS_AUSENTE',
        'CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE',
        'PROTECAO_CLICKJACKING_AUSENTE',
        'CABECALHO_REFERRER_POLICY_AUSENTE',
        'CABECALHO_PERMISSIONS_POLICY_AUSENTE',
        'COOKIE_SEM_SECURE',
        'COOKIE_SEM_HTTPONLY',
        'COOKIE_SEM_SAMESITE',
        'VERSAO_EXPOSTA_SERVER',
        'VERSAO_EXPOSTA_X_POWERED_BY',
      ].sort(),
    );
  });

  it('toda constatação traz campos completos e conformidade', () => {
    const resposta = comCabecalhos({ 'x-powered-by': 'PHP/8.1' }, 'http://hml.exemplo-loja.net/');
    for (const c of analisarRespostaPassiva(resposta)) {
      expect(c.titulo).not.toBe('');
      expect(c.descricao).not.toBe('');
      expect(c.local).toMatch(/^(cabecalho|cookie|tls):/);
      expect(c.evidencia.requisicao).toBe('GET http://hml.exemplo-loja.net/');
      expect(c.evidencia.resposta).toContain('HTTP 200');
      expect(c.correcaoSugerida).toContain('nginx');
      expect(c.correcaoSugerida).toContain('Express');
      expect(c.conformidade.lgpd).toEqual(['Art. 46: medidas de segurança']);
      expect(c.conformidade.owasp.length).toBeGreaterThan(0);
    }
  });
});

describe('analisarCabecalhos', () => {
  it('HSTS não se aplica em http, mas HTTPS_AUSENTE é ALTA', () => {
    const r = analisarCabecalhos(comCabecalhos(BEM_CONFIGURADO.cabecalhos, 'http://hml.exemplo-loja.net/'));
    expect(tipos(r)).toEqual(['HTTPS_AUSENTE']);
    expect(r[0]?.severidade).toBe('ALTA');
    expect(r[0]?.conformidade.owasp).toEqual(['A04:2025 Falhas Criptográficas']);
  });

  it('severidades e locais estáveis', () => {
    const r = analisarCabecalhos(comCabecalhos({}));
    const porTipo = new Map(r.map((c) => [c.tipo, c]));
    expect(porTipo.get('CABECALHO_CSP_AUSENTE')).toMatchObject({
      severidade: 'MEDIA',
      local: 'cabecalho:content-security-policy',
    });
    expect(porTipo.get('CABECALHO_HSTS_AUSENTE')?.severidade).toBe('ALTA');
    expect(porTipo.get('CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE')?.severidade).toBe('BAIXA');
    expect(porTipo.get('PROTECAO_CLICKJACKING_AUSENTE')?.severidade).toBe('MEDIA');
    expect(porTipo.get('CABECALHO_REFERRER_POLICY_AUSENTE')?.severidade).toBe('BAIXA');
    expect(porTipo.get('CABECALHO_PERMISSIONS_POLICY_AUSENTE')?.severidade).toBe('BAIXA');
    expect(porTipo.get('CABECALHO_CSP_AUSENTE')?.conformidade.owasp).toEqual([
      'A02:2025 Configuração Incorreta de Segurança',
    ]);
  });

  it('X-Content-Type-Options com valor diferente de nosniff é constatação', () => {
    const r = analisarCabecalhos({ ...BEM_CONFIGURADO, cabecalhos: { ...BEM_CONFIGURADO.cabecalhos, 'x-content-type-options': 'sniff' } });
    expect(tipos(r)).toEqual(['CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE']);
  });

  it('clickjacking: frame-ancestors no CSP ou X-Frame-Options bastam', () => {
    const semFrame = { ...BEM_CONFIGURADO.cabecalhos, 'content-security-policy': "default-src 'self'" };
    expect(tipos(analisarCabecalhos({ ...BEM_CONFIGURADO, cabecalhos: semFrame }))).toEqual([
      'PROTECAO_CLICKJACKING_AUSENTE',
    ]);
    expect(
      analisarCabecalhos({ ...BEM_CONFIGURADO, cabecalhos: { ...semFrame, 'x-frame-options': 'DENY' } }),
    ).toEqual([]);
  });
});

describe('analisarCookies', () => {
  it('interpreta vários cookies em array, sem diferenciar maiúsculas nos atributos', () => {
    const r = analisarCookies(
      comCabecalhos({
        'set-cookie': [
          'session_id=1; PATH=/; SECURE; HTTPONLY; SAMESITE=Strict',
          'tema=escuro; Path=/; samesite=lax',
          'auth_token=zzz; Secure; SameSite=None',
        ],
      }),
    );
    expect(r.map((c) => `${c.tipo}:${c.local}:${c.severidade}`)).toEqual([
      'COOKIE_SEM_SECURE:cookie:tema:MEDIA',
      'COOKIE_SEM_HTTPONLY:cookie:tema:MEDIA',
      'COOKIE_SEM_HTTPONLY:cookie:auth_token:ALTA',
    ]);
  });

  it('separa cookies unidos por vírgula sem quebrar a data de Expires', () => {
    const r = analisarCookies(
      comCabecalhos({
        'set-cookie':
          'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Secure; HttpOnly; SameSite=Lax, b=2; Secure; HttpOnly',
      }),
    );
    expect(r.map((c) => `${c.tipo}:${c.local}`)).toEqual(['COOKIE_SEM_SAMESITE:cookie:b']);
  });

  it('Secure não se aplica em http, mas SameSite e HttpOnly sim', () => {
    const r = analisarCookies(comCabecalhos({ 'set-cookie': 'sid=1' }, 'http://hml.exemplo-loja.net/'));
    expect(tipos(r)).toEqual(['COOKIE_SEM_HTTPONLY', 'COOKIE_SEM_SAMESITE']);
    expect(r[0]?.severidade).toBe('ALTA');
    expect(r[1]?.severidade).toBe('MEDIA');
  });

  it('não vaza o valor do cookie na evidência', () => {
    const r = analisarCookies(comCabecalhos({ 'set-cookie': 'sess=segredo-super-secreto' }));
    for (const c of r) {
      expect(JSON.stringify(c)).not.toContain('segredo-super-secreto');
    }
  });

  it('ignora resposta sem set-cookie', () => {
    expect(analisarCookies(comCabecalhos({}))).toEqual([]);
  });
});

describe('analisarExposicaoDeVersao', () => {
  it('Server com versão é constatação; sem versão não é', () => {
    expect(tipos(analisarExposicaoDeVersao(comCabecalhos({ server: 'nginx/1.18.0 (Ubuntu)' })))).toEqual([
      'VERSAO_EXPOSTA_SERVER',
    ]);
    expect(analisarExposicaoDeVersao(comCabecalhos({ server: 'nginx' }))).toEqual([]);
    expect(analisarExposicaoDeVersao(comCabecalhos({ server: 'cloudflare' }))).toEqual([]);
  });

  it('X-Powered-By presente e outros cabeçalhos de versão', () => {
    const r = analisarExposicaoDeVersao(
      comCabecalhos({
        'x-powered-by': 'Express',
        'x-aspnet-version': '4.0.30319',
        'x-aspnetmvc-version': '5.2',
        'x-generator': 'Drupal 9',
      }),
    );
    expect(tipos(r)).toEqual([
      'VERSAO_EXPOSTA_X_POWERED_BY',
      'VERSAO_EXPOSTA_OUTROS',
      'VERSAO_EXPOSTA_OUTROS',
      'VERSAO_EXPOSTA_OUTROS',
    ]);
    expect(r.every((c) => c.severidade === 'BAIXA')).toBe(true);
    expect(r.map((c) => c.local)).toContain('cabecalho:x-powered-by');
  });
});

describe('analisarTls', () => {
  const AGORA = new Date('2026-06-01T00:00:00Z');
  const certificadoBom = {
    validoDe: new Date('2026-01-01T00:00:00Z'),
    validoAte: new Date('2026-12-01T00:00:00Z'),
    emissor: "Let's Encrypt",
    sujeito: 'hml.exemplo-loja.net',
    confiavel: true,
    nomeConfere: true,
    motivoDaDesconfianca: null,
  };
  const dados = (sobrescrever: Partial<DadosDoTls> = {}): DadosDoTls => ({
    host: 'hml.exemplo-loja.net',
    protocolosAceitos: ['TLSv1.2', 'TLSv1.3'],
    certificado: certificadoBom,
    ...sobrescrever,
  });

  it('TLS saudável gera zero constatações', () => {
    expect(analisarTls(dados(), AGORA)).toEqual([]);
  });

  it('uma constatação por protocolo obsoleto', () => {
    const r = analisarTls(dados({ protocolosAceitos: ['TLSv1', 'TLSv1.1', 'TLSv1.2'] }), AGORA);
    expect(r.map((c) => `${c.tipo}:${c.local}:${c.severidade}`)).toEqual([
      'TLS_VERSAO_OBSOLETA:tls:protocolo:TLSv1:ALTA',
      'TLS_VERSAO_OBSOLETA:tls:protocolo:TLSv1.1:ALTA',
    ]);
    expect(r[0]?.conformidade.owasp).toEqual(['A04:2025 Falhas Criptográficas']);
  });

  it('certificado expirado é CRITICA', () => {
    const r = analisarTls(
      dados({ certificado: { ...certificadoBom, validoAte: new Date('2026-05-31T23:59:59Z') } }),
      AGORA,
    );
    expect(r.map((c) => `${c.tipo}:${c.severidade}`)).toEqual(['TLS_CERTIFICADO_EXPIRADO:CRITICA']);
  });

  it('expirando em menos de 30 dias é ALTA; com 30 dias ou mais não', () => {
    const quase = analisarTls(
      dados({ certificado: { ...certificadoBom, validoAte: new Date('2026-06-30T23:59:59Z') } }),
      AGORA,
    );
    expect(quase.map((c) => `${c.tipo}:${c.severidade}`)).toEqual(['TLS_CERTIFICADO_EXPIRANDO:ALTA']);
    const folga = analisarTls(
      dados({ certificado: { ...certificadoBom, validoAte: new Date('2026-07-01T00:00:00Z') } }),
      AGORA,
    );
    expect(folga).toEqual([]);
  });

  it('certificado não confiável traz o motivo', () => {
    const r = analisarTls(
      dados({ certificado: { ...certificadoBom, confiavel: false, motivoDaDesconfianca: 'certificado autoassinado' } }),
      AGORA,
    );
    expect(tipos(r)).toEqual(['TLS_CERTIFICADO_NAO_CONFIAVEL']);
    expect(r[0]?.severidade).toBe('ALTA');
    expect(r[0]?.descricao).toContain('certificado autoassinado');
    expect(r[0]?.evidencia.observacao).toContain('certificado autoassinado');
  });

  it('nome que não confere é ALTA', () => {
    const r = analisarTls(dados({ certificado: { ...certificadoBom, nomeConfere: false } }), AGORA);
    expect(r.map((c) => `${c.tipo}:${c.severidade}`)).toEqual(['TLS_NOME_NAO_CONFERE:ALTA']);
  });

  it('sem certificado coletado, só avalia protocolos', () => {
    expect(analisarTls(dados({ certificado: null }), AGORA)).toEqual([]);
  });
});
