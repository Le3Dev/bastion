import { afterEach, describe, expect, it } from 'vitest';
import { RequisicaoBloqueada } from '../../guardiao-de-escopo/cliente-http';
import { criarAmbiente, escapar, html, servir, type AlvoLocal } from './alvos-de-teste';
import { descobrirPaginas, extrairFormularios } from './descoberta';
import { avaliarWeb, detectarErroDetalhado } from './web';

const alvos: AlvoLocal[] = [];
const ambientes: ReturnType<typeof criarAmbiente>[] = [];
afterEach(async () => {
  await Promise.all(alvos.splice(0).map((a) => a.fechar()));
  await Promise.all(ambientes.splice(0).map((a) => a.cliente.fechar()));
});

const PAGINA_INICIAL = `<html><body>
  <a href="/busca?q=1">Busca</a> <a href="/erro?x=1">Erro</a> <a href="/admin/painel">Admin</a>
  <a href="/logout">Sair</a> <a href="https://externo.exemplo/fora">Fora</a>
  <form action="/busca" method="get"><input name="q" value=""><input type="submit"></form>
</body></html>`;

async function servidorVulneravel(): Promise<AlvoLocal> {
  const alvo = await servir((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const caminho = url.pathname;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { allow: 'GET, HEAD, OPTIONS, TRACE, PUT' });
      return void res.end();
    }
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
    res.setHeader('access-control-allow-credentials', 'true');
    if (url.searchParams.has('next')) {
      res.writeHead(302, { location: url.searchParams.get('next') ?? '/' });
      return void res.end();
    }
    if (caminho === '/') return html(res, PAGINA_INICIAL);
    if (caminho === '/.git/HEAD') return void res.end('ref: refs/heads/main\n');
    if (caminho === '/.env') return void res.end('APP_KEY=base64:segredo-super-secreto\nDB_PASSWORD=senha123\n');
    if (caminho === '/uploads/') return html(res, '<html><title>Index of /uploads</title><h1>Index of /uploads</h1></html>');
    if (caminho === '/busca') return html(res, `<html><p>Resultados para ${url.searchParams.get('q') ?? ''}</p></html>`);
    if (caminho === '/erro') {
      const x = url.searchParams.get('x') ?? '';
      return html(
        res,
        x.includes("'")
          ? "<pre>You have an error in your SQL syntax; check the manual near ''' at line 1</pre>"
          : '<p>ok</p>',
      );
    }
    return html(res, '<h1>Não encontrado</h1>', 404);
  });
  alvos.push(alvo);
  return alvo;
}

async function servidorSaudavel(): Promise<AlvoLocal> {
  const alvo = await servir((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { allow: 'GET, HEAD, OPTIONS' });
      return void res.end();
    }
    if (url.pathname === '/') return html(res, PAGINA_INICIAL.replace('/admin/painel', '/contato'));
    if (url.pathname === '/.well-known/security.txt') return void res.end('Contact: mailto:seguranca@exemplo.com.br\n');
    if (url.pathname === '/busca') return html(res, `<p>Resultados para ${escapar(url.searchParams.get('q') ?? '')}</p>`);
    if (url.pathname === '/erro') return html(res, '<p>Algo deu errado. Código 7F3A.</p>');
    // Qualquer outro caminho (inclusive SPA de fallback) devolve a mesma página sem conteúdo sensível.
    return html(res, '<html><body>Página genérica</body></html>', 404);
  });
  alvos.push(alvo);
  return alvo;
}

describe('descoberta de páginas', () => {
  it('extrai formulários, campos ocultos e token CSRF', () => {
    const [form] = extrairFormularios(
      '<form action="/entrar" method="POST"><input type="hidden" name="csrf_token" value="abc"><input name="usuario"><input type="password" name="senha"><input type="submit" value="Ir"></form>',
      'http://127.0.0.1/login',
    );
    expect(form?.metodo).toBe('POST');
    expect(form?.acao).toBe('http://127.0.0.1/entrar');
    expect(form?.tokenCsrf).toEqual({ nome: 'csrf_token', valor: 'abc' });
    expect(form?.campos.map((c) => c.nome)).toEqual(['csrf_token', 'usuario', 'senha']);
  });

  it('segue só o mesmo host, respeita caminhos excluídos e nunca segue sair/apagar', async () => {
    const alvo = await servidorVulneravel();
    const ambiente = criarAmbiente({ caminhosExcluidos: ['/admin'] });
    ambientes.push(ambiente);
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial: `${alvo.url}/` });
    const caminhos = paginas.map((p) => new URL(p.url).pathname);
    expect(caminhos).toEqual(expect.arrayContaining(['/', '/busca', '/erro']));
    expect(alvo.pedidos.some((p) => p.includes('/admin'))).toBe(false);
    expect(alvo.pedidos.some((p) => p.includes('/logout'))).toBe(false);
    expect(ambiente.decisoes.every((d) => !d.url.includes('externo.exemplo'))).toBe(true);
    expect(paginas[0]?.formularios[0]?.acao).toBe(`${alvo.url}/busca`);
  });

  it('respeita o teto de páginas', async () => {
    const alvo = await servidorVulneravel();
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial: `${alvo.url}/`, maximoDePaginas: 2 });
    expect(paginas).toHaveLength(2);
  });
});

describe('descoberta por fontes extras', () => {
  async function servidorSemLinks(): Promise<AlvoLocal> {
    const alvo = await servir((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const caminho = url.pathname;
      if (caminho === '/') return html(res, '<html><body>Sem links</body></html>');
      if (caminho === '/robots.txt') {
        return void res.end('User-agent: *\nDisallow: /restrito/\nAllow: /publico\nDisallow: /*.pdf$\nDisallow: /logout\n');
      }
      if (caminho === '/sitemap.xml') {
        return void res.end(
          `<?xml version="1.0"?><urlset><url><loc>http://${req.headers.host ?? ''}/mapa?ref=1</loc></url><url><loc>https://externo.exemplo/x</loc></url></urlset>`,
        );
      }
      if (['/restrito/', '/publico', '/mapa', '/login', '/redir'].includes(caminho)) return html(res, `<html>${caminho}</html>`);
      return html(res, '<h1>Não encontrado</h1>', 404);
    });
    alvos.push(alvo);
    return alvo;
  }

  it('encontra páginas via robots.txt, sitemap.xml e caminhos comuns, sem sair do host', async () => {
    const alvo = await servidorSemLinks();
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial: `${alvo.url}/` });
    const caminhos = paginas.map((p) => new URL(p.url).pathname);
    expect(caminhos).toEqual(expect.arrayContaining(['/', '/restrito/', '/publico', '/mapa', '/login']));
    expect(paginas.find((p) => p.url.includes('/mapa'))?.parametros).toEqual(['ref']);
    expect(alvo.pedidos.some((p) => p.includes('/logout') || p.includes('externo'))).toBe(false);
  });

  it('não semeia caminhos excluídos e respeita o teto de páginas', async () => {
    const alvo = await servidorSemLinks();
    const ambiente = criarAmbiente({ caminhosExcluidos: ['/restrito'] });
    ambientes.push(ambiente);
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial: `${alvo.url}/`, maximoDePaginas: 3 });
    expect(paginas).toHaveLength(3);
    expect(alvo.pedidos.some((p) => p.includes('/restrito'))).toBe(false);
  });

  it('inclui URLs com parâmetros mesmo não-HTML ou 5xx, mas não rotas não-HTML sem parâmetro', async () => {
    const alvo = await servir((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/') {
        return html(res, '<a href="/api/lista?id=1">j</a><a href="/falha?v=1">f</a><a href="/api/puro">p</a>');
      }
      if (url.pathname === '/api/lista') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return void res.end('{"ok":true}');
      }
      if (url.pathname === '/falha') {
        res.writeHead(500, { 'content-type': 'text/plain' });
        return void res.end('erro');
      }
      if (url.pathname === '/api/puro') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return void res.end('{}');
      }
      return html(res, 'x', 404);
    });
    alvos.push(alvo);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial: `${alvo.url}/` });
    const caminhos = paginas.map((p) => new URL(p.url).pathname);
    expect(caminhos).toEqual(expect.arrayContaining(['/api/lista', '/falha']));
    expect(caminhos).not.toContain('/api/puro');
    expect(paginas.find((p) => p.url.includes('/falha'))?.formularios).toEqual([]);
  });

  it('detecta redirecionamento aberto pelo parâmetro "para" e testa parâmetros reais', async () => {
    const alvo = await servir((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/') return html(res, '<a href="/redir?para=/inicio">ir</a><a href="/busca?termo=x">b</a>');
      if (url.pathname === '/redir') {
        res.writeHead(302, { location: url.searchParams.get('para') ?? '/' });
        return void res.end();
      }
      if (url.pathname === '/busca') return html(res, `<p>${url.searchParams.get('termo') ?? ''}</p>`);
      if (url.pathname === '/inicio') return html(res, '<p>inicio</p>');
      return html(res, 'x', 404);
    });
    alvos.push(alvo);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const urlInicial = `${alvo.url}/`;
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial });
    expect(paginas.find((p) => p.url.includes('/busca'))?.parametros).toEqual(['termo']);
    const constatacoes = await avaliarWeb({ contexto: ambiente.contexto, urlInicial, paginas });
    const redir = constatacoes.find((c) => c.tipo === 'REDIRECIONAMENTO_ABERTO');
    expect(redir?.local).toBe('parametro:/redir?para');
    const reflexo = constatacoes.find((c) => c.tipo === 'ENTRADA_REFLETIDA_SEM_ESCAPE');
    expect(reflexo?.local).toBe('parametro:/busca?termo');
  });
});

describe('módulo ativo web (perfil PADRAO)', () => {
  it('encontra as falhas de um alvo vulnerável, com evidência e sem expor segredos', async () => {
    const alvo = await servidorVulneravel();
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const urlInicial = `${alvo.url}/`;
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial });
    const constatacoes = await avaliarWeb({ contexto: ambiente.contexto, urlInicial, paginas });
    const tipos = new Set(constatacoes.map((c) => c.tipo));

    for (const esperado of [
      'ARQUIVO_SENSIVEL_EXPOSTO',
      'LISTAGEM_DE_DIRETORIO',
      'CORS_PERMISSIVO',
      'METODO_HTTP_PERIGOSO',
      'REDIRECIONAMENTO_ABERTO',
      'ENTRADA_REFLETIDA_SEM_ESCAPE',
      'ERRO_DETALHADO_EXPOSTO',
      'SECURITY_TXT_AUSENTE',
    ] as const) {
      expect(tipos, esperado).toContain(esperado);
    }
    const arquivos = constatacoes.filter((c) => c.tipo === 'ARQUIVO_SENSIVEL_EXPOSTO').map((c) => c.local);
    expect(arquivos).toEqual(expect.arrayContaining(['caminho:/.git/HEAD', 'caminho:/.env']));

    const cors = constatacoes.find((c) => c.tipo === 'CORS_PERMISSIVO');
    expect(cors?.severidade).toBe('ALTA');
    for (const c of constatacoes) {
      expect(c.evidencia.requisicao).not.toBe('');
      expect(c.correcaoSugerida).not.toBe('');
      expect(c.conformidade.owasp.length).toBeGreaterThan(0);
    }
    const tudo = JSON.stringify(constatacoes);
    expect(tudo).not.toContain('segredo-super-secreto');
    expect(tudo).not.toContain('senha123');
    // Nada destrutivo: só GET e OPTIONS.
    expect(alvo.pedidos.every((p) => p.startsWith('GET ') || p.startsWith('OPTIONS '))).toBe(true);
  });

  it('não acusa nada em um alvo saudável (sem falso positivo)', async () => {
    const alvo = await servidorSaudavel();
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const urlInicial = `${alvo.url}/`;
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial });
    const constatacoes = await avaliarWeb({ contexto: ambiente.contexto, urlInicial, paginas });
    expect(constatacoes).toEqual([]);
  });

  it('detecta apenas padrões reais de erro', () => {
    expect(detectarErroDetalhado('ORA-00933: SQL command not properly ended')).toBe('erro de banco Oracle');
    expect(detectarErroDetalhado('<p>Página não encontrada</p>')).toBeNull();
  });
});

describe('reflexão por contexto, arquivos novos e CORS com origem nula', () => {
  const PAGINA = '<html><body><a href="/r?q=1">r</a></body></html>';

  async function avaliar(
    manipulador: Parameters<typeof servir>[0],
  ): Promise<{ alvo: AlvoLocal; constatacoes: Awaited<ReturnType<typeof avaliarWeb>> }> {
    const alvo = await servir(manipulador);
    alvos.push(alvo);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const urlInicial = `${alvo.url}/`;
    const paginas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial });
    const constatacoes = await avaliarWeb({ contexto: ambiente.contexto, urlInicial, paginas });
    return { alvo, constatacoes };
  }

  const pagina = (res: Parameters<typeof html>[0], caminho: string, corpo: string): void =>
    caminho === '/' ? html(res, PAGINA) : html(res, corpo, caminho === '/r' ? 200 : 404);

  it('detecta reflexão em atributo quando a aspa sobrevive', async () => {
    const { constatacoes } = await avaliar((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const q = (url.searchParams.get('q') ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      pagina(res, url.pathname, `<html><input name="q" value="${q}"></html>`);
    });
    const achado = constatacoes.find((c) => c.tipo === 'ENTRADA_REFLETIDA_SEM_ESCAPE');
    expect(achado?.titulo).toContain('atributo');
    expect(achado?.severidade).toBe('ALTA');
  });

  it('detecta reflexão em string JavaScript com aspa simples intacta', async () => {
    const { constatacoes } = await avaliar((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const q = (url.searchParams.get('q') ?? '').replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/"/g, '\\"');
      pagina(res, url.pathname, `<html><script>var termo = '${q}';</script></html>`);
    });
    const achado = constatacoes.find((c) => c.tipo === 'ENTRADA_REFLETIDA_SEM_ESCAPE');
    expect(achado?.titulo).toContain('script');
  });

  it('não acusa páginas que escapam corretamente em corpo, atributo e script', async () => {
    const { constatacoes } = await avaliar((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const q = url.searchParams.get('q') ?? '';
      const seguro = escapar(q).replace(/'/g, '&#39;');
      const js = JSON.stringify(q).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/'/g, '\\u0027');
      pagina(
        res,
        url.pathname,
        `<html><p>${seguro}</p><input value="${seguro}"><script>var a = ${js}; var b = '${js.slice(1, -1)}';</script></html>`,
      );
    });
    expect(constatacoes.filter((c) => c.tipo === 'ENTRADA_REFLETIDA_SEM_ESCAPE')).toEqual([]);
  });

  it('detecta /.env.local, mascarando os valores', async () => {
    const { constatacoes } = await avaliar((req, res) => {
      if (req.url === '/.env.local') return void res.end('API_TOKEN=valor-ultra-secreto\n');
      html(res, '<html>x</html>', 404);
    });
    const achado = constatacoes.find((c) => c.local === 'caminho:/.env.local');
    expect(achado?.tipo).toBe('ARQUIVO_SENSIVEL_EXPOSTO');
    expect(JSON.stringify(constatacoes)).not.toContain('valor-ultra-secreto');
  });

  it('detecta CORS com Origin: null e credenciais, só quando a origem é nula', async () => {
    const { constatacoes } = await avaliar((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { allow: 'GET, HEAD, OPTIONS' });
        return void res.end();
      }
      if (req.headers.origin === 'null') {
        res.setHeader('access-control-allow-origin', 'null');
        res.setHeader('access-control-allow-credentials', 'true');
      }
      html(res, '<html>x</html>', 404);
    });
    const cors = constatacoes.filter((c) => c.tipo === 'CORS_PERMISSIVO');
    expect(cors).toHaveLength(1);
    expect(cors[0]?.severidade).toBe('ALTA');
    expect(cors[0]?.titulo).toContain('null');
  });
});

describe('freios do contexto', () => {
  it('recusa POST quando a criação de dados não foi autorizada, sem tocar o alvo', async () => {
    const alvo = await servidorSaudavel();
    const ambiente = criarAmbiente({ permitirCriacaoDeDados: false });
    ambientes.push(ambiente);
    const resposta = await ambiente.contexto.enviar({
      url: `${alvo.url}/busca`,
      metodo: 'POST',
      intencao: 'CRIACAO',
      corpo: 'q=bastion-teste-1',
    });
    expect(resposta).toBeNull();
    await expect(
      ambiente.contexto.requisitar({ url: `${alvo.url}/busca`, metodo: 'POST', intencao: 'CRIACAO' }),
    ).rejects.toBeInstanceOf(RequisicaoBloqueada);
    // Método que escreve sem intenção declarada também é recusado.
    expect(await ambiente.contexto.enviar({ url: `${alvo.url}/busca`, metodo: 'DELETE' })).toBeNull();
    expect(alvo.pedidos).toEqual([]);
  });

  it('com consentimento, POST sai marcado e o Guardião ainda barra caminhos excluídos', async () => {
    const alvo = await servidorSaudavel();
    const ambiente = criarAmbiente({ permitirCriacaoDeDados: true, caminhosExcluidos: ['/pagamento'] });
    ambientes.push(ambiente);
    const ok = await ambiente.contexto.enviar({ url: `${alvo.url}/busca`, metodo: 'POST', intencao: 'CRIACAO', corpo: 'q=1' });
    expect(ok?.status).toBe(200);
    const barrado = await ambiente.contexto.enviar({ url: `${alvo.url}/pagamento/novo`, metodo: 'POST', intencao: 'CRIACAO' });
    expect(barrado).toBeNull();
    expect(alvo.pedidos).toEqual(['POST /busca']);
    expect(ambiente.decisoes.at(-1)).toMatchObject({ decisao: 'BLOQUEADA' });
    expect(ambiente.decisoes.at(-1)?.motivo).toContain('Caminho excluído');
  });

  it('respeita metodosPermitidos do escopo', async () => {
    const alvo = await servidorSaudavel();
    const ambiente = criarAmbiente({ metodosPermitidos: ['GET', 'HEAD'] });
    ambientes.push(ambiente);
    expect(await ambiente.contexto.enviar({ url: `${alvo.url}/`, metodo: 'OPTIONS' })).toBeNull();
    expect(alvo.pedidos).toEqual([]);
  });
});
