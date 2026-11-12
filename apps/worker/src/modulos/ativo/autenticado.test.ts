import type { CredencialDeTeste } from '@bastion/contratos';
import { afterEach, describe, expect, it } from 'vitest';
import {
  autenticar,
  FalhaDeAutenticacao,
  protegerConstatacoes,
  repetirChecagensWeb,
  sondarControleDeAcesso,
  sondarInjecao,
  sondarPaginasSemSessao,
} from './autenticado';
import { criarAmbiente, escapar, html, servir, type AlvoLocal } from './alvos-de-teste';
import { descobrirPaginas } from './descoberta';

const SENHA = 'S3nha-Forte!';
const credencial: CredencialDeTeste = {
  modo: 'FORMULARIO',
  urlDeLogin: '',
  campoUsuario: 'usuario',
  campoSenha: 'senha',
  usuario: 'ana.teste',
  senha: SENHA,
  indicadorDeSucesso: 'Bem-vinda',
};

const alvos: AlvoLocal[] = [];
const ambientes: ReturnType<typeof criarAmbiente>[] = [];
afterEach(async () => {
  await Promise.all(alvos.splice(0).map((a) => a.fechar()));
  await Promise.all(ambientes.splice(0).map((a) => a.cliente.fechar()));
});

interface ServidorAutenticado {
  alvo: AlvoLocal;
  derrubarSessoes(): void;
}

const FORM_DE_LOGIN = (csrf: string, aviso = ''): string =>
  `<html><body>${aviso}<form action="/login" method="post"><input type="hidden" name="csrf_token" value="${csrf}">
  <input name="usuario"><input type="password" name="senha"><input type="submit" value="Entrar"></form></body></html>`;

async function servidorAutenticado(vulneravel: boolean): Promise<ServidorAutenticado> {
  const sessoes = new Set<string>();
  let contador = 0;
  const alvo = await servir((req, res, corpo) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const cookies = req.headers.cookie ?? '';
    const sessao = /sessao=([\w-]+)/.exec(cookies)?.[1];
    const logado = sessao !== undefined && sessoes.has(sessao);
    const q = (nome: string): string => url.searchParams.get(nome) ?? '';
    const exigirLogin = (): boolean => {
      if (logado) return false;
      res.writeHead(302, { location: '/login' });
      res.end();
      return true;
    };

    if (url.pathname === '/') {
      return html(res, '<a href="/login">Entrar</a> <a href="/painel">Painel</a> <a href="/logout">Sair</a>');
    }
    if (url.pathname === '/login' && req.method === 'GET') {
      res.setHeader('set-cookie', 'csrf=tok1; Path=/');
      return html(res, FORM_DE_LOGIN('tok1'));
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      const dados = new URLSearchParams(corpo);
      const valido =
        dados.get('csrf_token') === 'tok1' &&
        /csrf=tok1/.test(cookies) &&
        dados.get('usuario') === 'ana.teste' &&
        dados.get('senha') === SENHA;
      if (!valido) return html(res, FORM_DE_LOGIN('tok1', '<p>Credenciais inválidas</p>'));
      contador += 1;
      const token = `s${contador}`;
      sessoes.add(token);
      res.writeHead(302, { location: '/painel', 'set-cookie': `sessao=${token}; Path=/; HttpOnly` });
      return void res.end();
    }
    if (url.pathname === '/painel') {
      if (exigirLogin()) return;
      return html(
        res,
        `<h1>Bem-vinda, ana</h1>
        <a href="/pedido?id=10">Pedido</a> <a href="/relatorio">Relatório</a> <a href="/sql?id=1">SQL</a>
        <a href="/bool?id=1">Bool</a> <a href="/tpl?nome=ana">Tpl</a> <a href="/arq?file=ajuda.txt">Arq</a>`,
      );
    }
    if (url.pathname === '/relatorio') {
      if (!vulneravel && exigirLogin()) return;
      return html(res, '<h1>Relatório mensal confidencial</h1><p>Receita, clientes e metas do trimestre.</p>');
    }
    if (url.pathname === '/pedido') {
      if (exigirLogin()) return;
      const id = Number(q('id'));
      if (!vulneravel) return html(res, id === 10 ? `<p>Pedido 10 da ana</p>` : '<p>Proibido</p>', id === 10 ? 200 : 403);
      return Number.isInteger(id) && id >= 1 && id <= 50
        ? html(res, `<p>Pedido ${id} do usuário user${id}</p>`)
        : html(res, '<p>Não encontrado</p>', 404);
    }
    if (url.pathname === '/derrubar') {
      sessoes.clear();
      return void res.end('ok');
    }
    if (exigirLogin()) return;
    if (url.pathname === '/sql') {
      return html(
        res,
        vulneravel && q('id').includes("'")
          ? '<pre>You have an error in your SQL syntax near \'\'\'</pre>'
          : '<p>Item 1</p>',
      );
    }
    if (url.pathname === '/bool') {
      const falso = /AND\s+(1=2|'1'='2)/.test(q('id'));
      return html(
        res,
        vulneravel && falso ? '<p>Resultados: 0</p>' : '<p>Resultados: 1 -> item de catálogo número um</p>',
      );
    }
    if (url.pathname === '/tpl') {
      const entrada = q('nome');
      const texto = vulneravel
        ? entrada.replace(/(?:\{\{|\$\{|<%= ?|#\{)(\d+)\*(\d+)(?:\}\}|\}| ?%>)/g, (_t, a: string, b: string) =>
            String(Number(a) * Number(b)),
          )
        : entrada;
      return html(res, `<p>Olá, ${escapar(texto)}</p>`);
    }
    if (url.pathname === '/arq') {
      const arquivo = q('file');
      if (vulneravel && arquivo.includes('..') && arquivo.includes('etc/passwd')) {
        return void res.end('root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1::/:/sbin/nologin\n');
      }
      return html(res, vulneravel ? `<p>Arquivo: ${escapar(arquivo)}</p>` : '<p>Arquivo solicitado.</p>');
    }
    return html(res, 'não encontrado', 404);
  });
  alvos.push(alvo);
  return { alvo, derrubarSessoes: () => void fetch(`${alvo.url}/derrubar`) };
}

const comUrl = (alvo: AlvoLocal): CredencialDeTeste => ({ ...credencial, urlDeLogin: `${alvo.url}/login` });

describe('autenticação de teste', () => {
  it('faz login por formulário (CSRF + cookie) e mantém a sessão', async () => {
    const { alvo } = await servidorAutenticado(true);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const sessao = await autenticar({ contexto: ambiente.contexto, credencial: comUrl(alvo) });
    const painel = await sessao.contexto.enviar({ url: `${alvo.url}/painel` });
    expect(painel?.status).toBe(200);
    expect(painel?.trechoDoCorpo).toContain('Bem-vinda');
    const anonimo = await sessao.semSessao.enviar({ url: `${alvo.url}/painel`, naoSeguirRedirecionamentos: true });
    expect(anonimo?.status).toBe(302);
  });

  it('falha com mensagem clara e sem vazar usuário ou senha', async () => {
    const { alvo } = await servidorAutenticado(true);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const errada = { ...comUrl(alvo), senha: 'senha-errada-123' };
    const erro = await autenticar({ contexto: ambiente.contexto, credencial: errada }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaDeAutenticacao);
    const mensagem = (erro as Error).message;
    expect(mensagem).toContain('indicador de sucesso');
    expect(mensagem).not.toContain('senha-errada-123');
    expect(mensagem).not.toContain('ana.teste');
    // O login sai como POST de autenticação, e a senha jamais aparece nas decisões do Guardião.
    expect(JSON.stringify(ambiente.decisoes)).not.toContain('senha-errada-123');
  });

  it('refaz o login quando a sessão cai', async () => {
    const { alvo, derrubarSessoes } = await servidorAutenticado(true);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const sessao = await autenticar({ contexto: ambiente.contexto, credencial: comUrl(alvo) });
    derrubarSessoes();
    await new Promise((r) => setTimeout(r, 50));
    const painel = await sessao.contexto.enviar({ url: `${alvo.url}/painel` });
    expect(painel?.status).toBe(200);
    expect(sessao.relogins()).toBe(1);
  });

  it('suporta login JSON com token Bearer', async () => {
    let autorizacao = '';
    const alvo = await servir((req, res, corpo) => {
      if (req.url === '/api/login') {
        const dados = JSON.parse(corpo) as { email?: string; pass?: string };
        if (dados.email === 'ana@teste' && dados.pass === 'x1y2z3') {
          res.setHeader('content-type', 'application/json');
          return void res.end(JSON.stringify({ data: { access_token: 'tok-abc' }, ok: true }));
        }
        res.writeHead(401);
        return void res.end();
      }
      autorizacao = String(req.headers.authorization);
      res.end('ok');
    });
    alvos.push(alvo);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const sessao = await autenticar({
      contexto: ambiente.contexto,
      credencial: {
        modo: 'JSON',
        urlDeLogin: `${alvo.url}/api/login`,
        campoUsuario: 'email',
        campoSenha: 'pass',
        usuario: 'ana@teste',
        senha: 'x1y2z3',
        indicadorDeSucesso: '"ok":true',
      },
    });
    await sessao.contexto.enviar({ url: `${alvo.url}/api/dados` });
    expect(autorizacao).toBe('Bearer tok-abc');
  });
});

async function avaliarAutenticado(vulneravel: boolean) {
  const { alvo } = await servidorAutenticado(vulneravel);
  const ambiente = criarAmbiente();
  ambientes.push(ambiente);
  const cred = comUrl(alvo);
  const sessao = await autenticar({ contexto: ambiente.contexto, credencial: cred });
  const urlInicial = `${alvo.url}/`;
  const anonimas = await descobrirPaginas({ contexto: ambiente.contexto, urlInicial });
  const autenticadas = await descobrirPaginas({ contexto: sessao.contexto, urlInicial });
  const constatacoes = protegerConstatacoes(
    [
      ...(await sondarPaginasSemSessao(sessao, autenticadas, anonimas)),
      ...(await sondarControleDeAcesso(sessao, autenticadas)),
      ...(await repetirChecagensWeb(sessao, urlInicial, autenticadas)),
      ...(await sondarInjecao(sessao, autenticadas)),
    ],
    cred,
  );
  return { alvo, constatacoes, autenticadas };
}

describe('módulo ativo autenticado (perfil COMPLETO)', () => {
  it('encontra as falhas autenticadas de um alvo vulnerável sem vazar credenciais', async () => {
    const { alvo, constatacoes, autenticadas } = await avaliarAutenticado(true);
    expect(autenticadas.map((p) => new URL(p.url).pathname)).toContain('/painel');
    const tipos = constatacoes.map((c) => c.tipo);
    expect(tipos).toContain('PAGINA_SENSIVEL_SEM_AUTENTICACAO');
    expect(tipos).toContain('CONTROLE_DE_ACESSO_QUEBRADO');
    expect(tipos).toContain('INJECAO_DE_TEMPLATE');
    expect(tipos).toContain('TRAVESSIA_DE_CAMINHO');
    const sql = constatacoes.filter((c) => c.tipo === 'INJECAO_SQL');
    expect(sql.map((c) => c.local)).toEqual(expect.arrayContaining(['parametro:/sql?id', 'parametro:/bool?id']));
    expect(sql.some((c) => c.titulo.includes('por erro'))).toBe(true);
    expect(sql.some((c) => c.titulo.includes('booleana'))).toBe(true);
    expect(sql.every((c) => c.severidade === 'CRITICA')).toBe(true);

    const tudo = JSON.stringify(constatacoes);
    expect(tudo).not.toContain(SENHA);
    expect(tudo).not.toContain('ana.teste');
    // A única escrita foi o login; nenhuma carga destrutiva.
    expect(alvo.pedidos.filter((p) => p.startsWith('POST'))).toEqual(['POST /login']);
    expect(alvo.pedidos.join('\n')).not.toMatch(/DROP|DELETE|;/i);
    expect(tudo).not.toMatch(/etc\/passwd.*\n.*daemon/);
  });

  it('não acusa nada em um alvo autenticado saudável (sem falso positivo)', async () => {
    const { constatacoes } = await avaliarAutenticado(false);
    expect(constatacoes).toEqual([]);
  });
});
