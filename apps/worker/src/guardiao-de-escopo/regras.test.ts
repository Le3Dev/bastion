import { describe, expect, it } from 'vitest';
import { avaliarRedirecionamento, avaliarRequisicao } from './regras';

const escopo = {
  hostsPermitidos: ['hml.exemplo-loja.net'],
  dominiosBloqueados: ['loja.com.br'],
  metodosPermitidos: ['GET', 'HEAD'],
};

describe('avaliarRequisicao', () => {
  it('permite GET em host do escopo', () => {
    expect(
      avaliarRequisicao({ url: 'https://hml.exemplo-loja.net/app', metodo: 'GET', perfil: 'PASSIVO', escopo }),
    ).toEqual({ permitida: true, motivo: 'Dentro do escopo verificado' });
  });

  it('ignora porta e maiúsculas no host', () => {
    expect(
      avaliarRequisicao({ url: 'https://HML.exemplo-loja.net:8443/', metodo: 'HEAD', perfil: 'PASSIVO', escopo })
        .permitida,
    ).toBe(true);
  });

  it('bloqueia protocolos que não são http/https', () => {
    for (const url of ['ftp://hml.exemplo-loja.net/', 'file:///etc/passwd', 'gopher://hml.exemplo-loja.net']) {
      expect(avaliarRequisicao({ url, metodo: 'GET', perfil: 'COMPLETO', escopo }).permitida).toBe(false);
    }
  });

  it('bloqueia URL inválida', () => {
    expect(avaliarRequisicao({ url: 'não-é-url', metodo: 'GET', perfil: 'PADRAO', escopo }).permitida).toBe(false);
  });

  it('bloqueia método fora de metodosPermitidos e libera quando o escopo o autoriza', () => {
    const url = 'https://hml.exemplo-loja.net/login';
    const passivo = avaliarRequisicao({ url, metodo: 'POST', perfil: 'PASSIVO', escopo });
    expect(passivo.permitida).toBe(false);
    expect(passivo.motivo).toContain('Método POST não permitido');
    const completo = { ...escopo, metodosPermitidos: ['GET', 'HEAD', 'POST'] };
    expect(avaliarRequisicao({ url, metodo: 'post', perfil: 'COMPLETO', escopo: completo }).permitida).toBe(true);
  });

  it('bloqueia caminhos excluídos pelo prefixo, mas não os vizinhos', () => {
    const comExclusao = { ...escopo, caminhosExcluidos: ['/admin', '/pagamento'] };
    const pedir = (caminho: string) =>
      avaliarRequisicao({ url: `https://hml.exemplo-loja.net${caminho}`, metodo: 'GET', perfil: 'PADRAO', escopo: comExclusao });
    expect(pedir('/admin/usuarios').permitida).toBe(false);
    expect(pedir('/admin/usuarios').motivo).toContain('Caminho excluído');
    expect(pedir('/pagamento').permitida).toBe(false);
    expect(pedir('/administracao-publica').permitida).toBe(false);
    expect(pedir('/loja').permitida).toBe(true);
  });

  it('produção continua vindo antes das demais regras', () => {
    const decisao = avaliarRequisicao({
      url: 'https://www.loja.com.br/admin',
      metodo: 'DELETE',
      perfil: 'COMPLETO',
      escopo: { ...escopo, caminhosExcluidos: ['/admin'] },
    });
    expect(decisao.motivo).toBe('Domínio de produção declarado');
  });

  it('bloqueia host fora do escopo', () => {
    expect(
      avaliarRequisicao({ url: 'https://outro.exemplo.net/', metodo: 'GET', perfil: 'PASSIVO', escopo }),
    ).toEqual({ permitida: false, motivo: 'Host fora do escopo verificado' });
  });

  it('bloqueia produção e subdomínios, mesmo se listados como permitidos', () => {
    const escopoPerigoso = {
      hostsPermitidos: ['loja.com.br', 'www.loja.com.br'],
      dominiosBloqueados: ['loja.com.br'],
      metodosPermitidos: ['GET', 'HEAD'],
    };
    for (const url of ['https://loja.com.br/', 'https://www.loja.com.br/', 'https://a.b.loja.com.br:444/']) {
      expect(
        avaliarRequisicao({ url, metodo: 'GET', perfil: 'PASSIVO', escopo: escopoPerigoso }),
      ).toEqual({ permitida: false, motivo: 'Domínio de produção declarado' });
    }
  });

  it('loja.com.br.evil.com NÃO casa com loja.com.br', () => {
    const decisao = avaliarRequisicao({
      url: 'https://loja.com.br.evil.com/',
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo,
    });
    expect(decisao.motivo).toBe('Host fora do escopo verificado');
    const liberado = avaliarRequisicao({
      url: 'https://loja.com.br.evil.com/',
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: { ...escopo, hostsPermitidos: ['loja.com.br.evil.com'] },
    });
    expect(liberado.permitida).toBe(true);
  });
});

describe('avaliarRedirecionamento', () => {
  const base = { origem: 'https://hml.exemplo-loja.net/a', saltos: 1, escopo, perfil: 'PASSIVO' as const };

  it('permite redirecionamento dentro do escopo, inclusive relativo', () => {
    expect(avaliarRedirecionamento({ ...base, destino: '/login' }).permitida).toBe(true);
    expect(avaliarRedirecionamento({ ...base, destino: 'https://hml.exemplo-loja.net/b' }).permitida).toBe(true);
  });

  it('bloqueia redirecionamento para fora do escopo', () => {
    const decisao = avaliarRedirecionamento({ ...base, destino: 'https://evil.example/' });
    expect(decisao.permitida).toBe(false);
    expect(decisao.motivo).toContain('Host fora do escopo verificado');
  });

  it('bloqueia redirecionamento para produção', () => {
    const decisao = avaliarRedirecionamento({ ...base, destino: 'https://www.loja.com.br/' });
    expect(decisao.permitida).toBe(false);
    expect(decisao.motivo).toContain('Domínio de produção declarado');
  });

  it('bloqueia protocolo inválido no destino', () => {
    expect(avaliarRedirecionamento({ ...base, destino: 'file:///etc/passwd' }).permitida).toBe(false);
  });

  it('limita o número de saltos (padrão 5)', () => {
    expect(avaliarRedirecionamento({ ...base, saltos: 5, destino: '/x' }).permitida).toBe(true);
    expect(avaliarRedirecionamento({ ...base, saltos: 6, destino: '/x' }).permitida).toBe(false);
    expect(avaliarRedirecionamento({ ...base, saltos: 3, maximoDeSaltos: 2, destino: '/x' }).permitida).toBe(false);
  });
});
