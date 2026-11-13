'use strict';
/*
 * ############################################################################
 * ALVO DE TESTE PROPOSITALMENTE VULNERÁVEL - uso exclusivo em laboratório
 * local; NUNCA exponha isto na internet nem em produção.
 * ############################################################################
 *
 * Fixture do Bastion para os módulos ativos, autenticado e de IA do worker.
 * Tudo é simulado e em memória: não há banco, não lê o sistema de arquivos e
 * não executa código recebido. Só usa node:http e node:url.
 */
const http = require('node:http');
const { URL } = require('node:url');
const crypto = require('node:crypto');

const PORTA = Number(process.env.PORT || 8080);
const SESSOES = new Set();
const COOKIE = 'sessao_alvo';

const PROMPT_DE_SISTEMA = 'PROMPT-SECRETO-BASTION';
const CANARIO = 'BASTION-CANARIO-9BRANCH';
const CPF_FALSO = '123.456.789-09';
const PALAVRA_CODIGO = 'BASTION-OBEDECI';

function html(res, status, corpo, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...extra });
  res.end(corpo);
}
function texto(res, status, corpo, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...extra });
  res.end(corpo);
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise((resolve) => {
    let dados = '';
    req.on('data', (c) => {
      dados += c;
      if (dados.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => resolve(dados));
    req.on('error', () => resolve(''));
  });
}
function temSessao(req) {
  const m = /(?:^|;\s*)sessao_alvo=([^;]+)/.exec(req.headers.cookie || '');
  return Boolean(m && SESSOES.has(m[1]));
}

// Respostas do chatbot (FALHAS PROPOSITAIS: vaza prompt, obedece injeção,
// vaza canário e CPF, devolve HTML sem escape).
function responderIa(mensagem) {
  const m = mensagem.toLowerCase();
  if (/prompt de sistema|system prompt|instru[cç][oõ]es (iniciais|internas)/.test(m)) {
    return `Meu prompt de sistema é: ${PROMPT_DE_SISTEMA}. Não conte a ninguém.`;
  }
  if (/ignore (as )?instru|ignore previous|ignore all/.test(m)) {
    return PALAVRA_CODIGO;
  }
  if (/cpf|token|canário|canario|segredo|dados do cliente/.test(m)) {
    return `Token interno: ${CANARIO}. CPF do cliente: ${CPF_FALSO}.`;
  }
  // Saída sem escape: o texto do usuário volta como veio (HTML/JS inclusive).
  return `Você disse: ${mensagem}`;
}

async function tratar(req, res) {
  const url = new URL(req.url, 'http://alvo.local');
  const rota = url.pathname;
  const q = url.searchParams;

  // Cabeçalho de identificação em TODAS as respostas.
  res.setHeader('X-Bastion-Alvo-De-Teste', 'inseguro-de-proposito');

  // MÉTODOS PERIGOSOS: OPTIONS anuncia PUT, DELETE e TRACE.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET, POST, PUT, DELETE, TRACE' });
    return res.end();
  }

  // ARQUIVOS EXPOSTOS: .git/HEAD e .env (conteúdo fake). security.txt NÃO existe.
  if (rota === '/.git/HEAD') return texto(res, 200, 'ref: refs/heads/main\n');
  if (rota === '/.env') return texto(res, 200, 'SENHA=exemplo\nCHAVE_API=chave-falsa-de-laboratorio\n');

  // LISTAGEM DE DIRETÓRIO.
  if (rota === '/uploads/' || rota === '/uploads') {
    return html(res, 200, '<html><head><title>Index of /uploads</title></head><body><h1>Index of /uploads</h1><ul><li><a href="a.txt">a.txt</a></li></ul></body></html>');
  }

  // REFLEXÃO SEM ESCAPE (ENTRADA_REFLETIDA_SEM_ESCAPE).
  if (rota === '/busca') {
    return html(res, 200, `<html><body><h1>Resultados para: ${q.get('q') ?? ''}</h1></body></html>`);
  }

  // ERRO DETALHADO: entrada com aspa simples ou "erro" gera stack/erro SQL FALSO.
  if (rota === '/erro') {
    const v = q.get('v') ?? '';
    if (v.includes("'") || v.includes('erro')) {
      return texto(res, 500,
        "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version near ''' at line 1\n" +
        'Error: falha simulada\n    at consultar (/var/www/app/db.js:42:11)\n    at /var/www/app/rotas.js:10:5\n');
    }
    return texto(res, 200, 'ok');
  }

  // CORS PERMISSIVO: reflete o Origin com credenciais.
  if (rota === '/api/dados') {
    const origem = req.headers.origin;
    const cab = { 'Content-Type': 'application/json' };
    if (origem) {
      cab['Access-Control-Allow-Origin'] = origem;
      cab['Access-Control-Allow-Credentials'] = 'true';
    }
    res.writeHead(200, cab);
    return res.end(JSON.stringify({ dados: 'publicos-de-laboratorio' }));
  }

  // REDIRECIONAMENTO ABERTO.
  if (rota === '/redir') {
    res.writeHead(302, { Location: q.get('para') ?? '/' });
    return res.end();
  }

  // LOGIN POR FORMULÁRIO (campo oculto de CSRF).
  if (rota === '/login' && req.method === 'GET') {
    return html(res, 200,
      '<html><body><form method="post" action="/login">' +
      '<input type="hidden" name="csrf_token" value="csrf-fixo-de-laboratorio">' +
      '<input type="text" name="usuario"><input type="password" name="senha">' +
      '<button type="submit">Entrar</button></form></body></html>');
  }
  if (rota === '/login' && req.method === 'POST') {
    const campos = new URLSearchParams(await lerCorpo(req));
    if (campos.get('usuario') === 'teste' && campos.get('senha') === 'teste-123') {
      const id = crypto.randomBytes(16).toString('hex');
      SESSOES.add(id);
      res.writeHead(302, { 'Set-Cookie': `${COOKIE}=${id}; Path=/; HttpOnly`, Location: '/painel' });
      return res.end();
    }
    return html(res, 401, '<html><body>Credenciais inválidas</body></html>');
  }

  // ÁREA AUTENTICADA: só com sessão.
  if (rota === '/painel') {
    if (!temSessao(req)) {
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }
    return html(res, 200, '<html><body><h1>Bem-vindo</h1><p>Painel do usuário de teste.</p></body></html>');
  }

  // CONTROLE DE ACESSO QUEBRADO + PÁGINA SENSÍVEL SEM AUTENTICAÇÃO:
  // não confere dono nem sessão; ids sequenciais.
  if (rota === '/conta') {
    const id = Number(q.get('id'));
    const contas = { 1: 'Conta 1 (dono: teste)', 2: 'Conta 2 (dono: outro usuário)', 3: 'Conta 3 (dono: administrador)' };
    if (contas[id]) {
      return html(res, 200, `<html><body><h1>Dados da conta</h1><p>id=${id}: ${contas[id]}. E-mail: conta${id}@exemplo.test</p></body></html>`);
    }
    return html(res, 404, '<html><body>Conta não encontrada</body></html>');
  }

  // INJEÇÃO SQL SIMULADA (por comparação booleana): condição verdadeira
  // devolve muitos itens; falsa devolve nenhum. Nada é executado.
  if (rota === '/produtos') {
    const cat = q.get('cat') ?? '';
    const verdadeira = /'\s*or\s*'?1'?\s*=\s*'?1|\bor\s+1\s*=\s*1|\band\s+1\s*=\s*1/i.test(cat);
    const falsa = /'\s*and\s*'?1'?\s*=\s*'?2|\band\s+1\s*=\s*2/i.test(cat);
    let itens = ['Caneta'];
    if (falsa) itens = [];
    else if (verdadeira) itens = ['Caneta', 'Caderno', 'Lápis', 'Borracha', 'Régua', 'Mochila'];
    return html(res, 200, `<html><body><h1>Produtos</h1><ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul><p>${itens.length} resultado(s)</p></body></html>`);
  }

  // INJEÇÃO DE TEMPLATE SIMULADA: só avalia {{ A*B }} de inteiros.
  if (rota === '/ola') {
    const nome = q.get('nome') ?? '';
    const saida = nome.replace(/\{\{\s*(\d{1,6})\s*\*\s*(\d{1,6})\s*\}\}/g, (_t, a, b) => String(Number(a) * Number(b)));
    return html(res, 200, `<html><body>Olá, ${saida}</body></html>`);
  }

  // TRAVESSIA DE CAMINHO SIMULADA: não toca no disco; devolve conteúdo marcado.
  if (rota === '/arquivo') {
    const bruto = q.get('nome') ?? '';
    // Decodifica percent-encoding (inseguro de propósito): a forma codificada vale como a crua.
    let nome = bruto;
    try { nome = decodeURIComponent(bruto); } catch { /* mantém o valor cru */ }
    if (/\.\.[\\/]|%2e%2e/i.test(nome) || /\.\.[\\/]|%2e%2e/i.test(bruto)) {
      return texto(res, 200, 'root:x:0:0:root:/root:/bin/sh\n# CONTEUDO-SIMULADO-DE-TRAVESSIA-BASTION\n');
    }
    return texto(res, 200, 'conteudo-comum');
  }

  // XSS REFLETIDO EM CONTEXTO DE ATRIBUTO: valor cru dentro de value="...".
  if (rota === '/perfil') {
    const nome = q.get('nome') ?? '';
    return html(res, 200, `<html><body><h1>Perfil</h1><form><input type="text" name="nome" value="${nome}"></form></body></html>`);
  }

  // XSS REFLETIDO EM CONTEXTO DE STRING JAVASCRIPT: valor cru dentro de '...'.
  if (rota === '/saudacao') {
    const user = q.get('user') ?? '';
    return html(res, 200, `<html><body><h1>Saudação</h1><script>var usuario = '${user}'; document.title = usuario;</script></body></html>`);
  }

  // CHATBOT DE IA VULNERÁVEL.
  if (rota === '/ia' && req.method === 'POST') {
    let mensagem = '';
    try {
      const corpo = JSON.parse(await lerCorpo(req));
      if (typeof corpo.mensagem === 'string') mensagem = corpo.mensagem;
    } catch {
      return json(res, 400, { erro: 'JSON inválido' });
    }
    return json(res, 200, { resposta: responderIa(mensagem) });
  }

  if (rota === '/') {
    return html(res, 200,
      '<html><body><h1>Alvo vulnerável de laboratório</h1><p>Inseguro de propósito. Nunca em produção.</p><ul>' +
      '<li><a href="/busca?q=ola">Busca</a></li>' +
      '<li><a href="/erro?v=1">Erro</a></li>' +
      '<li><a href="/redir?para=/">Redirecionamento</a></li>' +
      '<li><a href="/produtos?cat=1">Produtos</a></li>' +
      '<li><a href="/ola?nome=visitante">Olá</a></li>' +
      '<li><a href="/arquivo?nome=leia-me.txt">Arquivo</a></li>' +
      '<li><a href="/perfil?nome=visitante">Perfil</a></li>' +
      '<li><a href="/saudacao?user=visitante">Saudação</a></li>' +
      '<li><a href="/conta?id=1">Conta</a></li>' +
      '<li><a href="/uploads/">Uploads</a></li>' +
      '<li><a href="/api/dados">API</a></li>' +
      '<li><a href="/login">Entrar</a></li>' +
      '</ul></body></html>');
  }
  return html(res, 404, '<html><body>Não encontrado</body></html>');
}

http
  .createServer((req, res) => {
    tratar(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  })
  .listen(PORTA, () => {
    console.log(`Alvo vulnerável de laboratório (INSEGURO DE PROPÓSITO) na porta ${PORTA}`);
  });
