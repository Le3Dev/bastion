import {
  conformidade,
  descreverRequisicao,
  descreverResposta,
  primeiroValor,
  type Constatacao,
  type RespostaColetada,
} from './tipos';

const ehHttps = (resposta: RespostaColetada): boolean => resposta.url.toLowerCase().startsWith('https:');

export function analisarCabecalhos(resposta: RespostaColetada): Constatacao[] {
  const constatacoes: Constatacao[] = [];
  const cabecalhos = resposta.cabecalhos;
  const requisicao = descreverRequisicao(resposta);
  const csp = primeiroValor(cabecalhos['content-security-policy']);

  if (!ehHttps(resposta)) {
    constatacoes.push({
      tipo: 'HTTPS_AUSENTE',
      titulo: 'A aplicação responde sem HTTPS',
      severidade: 'ALTA',
      local: 'tls:https',
      descricao:
        'A resposta final foi entregue em http://, sem criptografia. Dados e cookies trafegam em texto puro e podem ser lidos ou alterados na rede.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, ['location']),
        observacao: 'A URL final da resposta usa o protocolo http:.',
      },
      correcaoSugerida:
        'Habilite TLS e redirecione todo o tráfego http para https.\n\nnginx:\nserver {\n  listen 80;\n  return 301 https://$host$request_uri;\n}\n\nExpress:\napp.use((req, res, next) => req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.url}`));',
      conformidade: conformidade(true),
    });
  }

  if (csp === undefined) {
    constatacoes.push({
      tipo: 'CABECALHO_CSP_AUSENTE',
      titulo: 'Cabeçalho Content-Security-Policy ausente',
      severidade: 'MEDIA',
      local: 'cabecalho:content-security-policy',
      descricao:
        'Sem uma política de segurança de conteúdo, o navegador não restringe as origens de scripts e recursos, o que facilita a exploração de XSS.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, []),
        observacao: 'A resposta não traz o cabeçalho content-security-policy.',
      },
      correcaoSugerida:
        "Defina uma política restritiva.\n\nnginx:\nadd_header Content-Security-Policy \"default-src 'self'; frame-ancestors 'none'\" always;\n\nExpress (helmet):\napp.use(helmet.contentSecurityPolicy({ directives: { defaultSrc: [\"'self'\"], frameAncestors: [\"'none'\"] } }));",
      conformidade: conformidade(false),
    });
  }

  if (ehHttps(resposta) && primeiroValor(cabecalhos['strict-transport-security']) === undefined) {
    constatacoes.push({
      tipo: 'CABECALHO_HSTS_AUSENTE',
      titulo: 'Cabeçalho Strict-Transport-Security (HSTS) ausente',
      severidade: 'ALTA',
      local: 'cabecalho:strict-transport-security',
      descricao:
        'Sem HSTS, o navegador pode aceitar uma primeira conexão em http e fica vulnerável a ataques de rebaixamento para HTTP.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, []),
        observacao: 'A resposta em https não traz o cabeçalho strict-transport-security.',
      },
      correcaoSugerida:
        'Envie o cabeçalho em todas as respostas https.\n\nnginx:\nadd_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n\nExpress (helmet):\napp.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));',
      conformidade: conformidade(true),
    });
  }

  const nosniff = primeiroValor(cabecalhos['x-content-type-options']);
  if (nosniff === undefined || nosniff.trim().toLowerCase() !== 'nosniff') {
    constatacoes.push({
      tipo: 'CABECALHO_X_CONTENT_TYPE_OPTIONS_AUSENTE',
      titulo: 'Cabeçalho X-Content-Type-Options ausente ou incorreto',
      severidade: 'BAIXA',
      local: 'cabecalho:x-content-type-options',
      descricao:
        'Sem "nosniff", o navegador pode interpretar arquivos com um tipo diferente do declarado, abrindo espaço para execução de conteúdo inesperado.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, ['x-content-type-options']),
        observacao:
          nosniff === undefined
            ? 'A resposta não traz o cabeçalho x-content-type-options.'
            : `O valor encontrado foi "${nosniff}", diferente de "nosniff".`,
      },
      correcaoSugerida:
        'Envie "nosniff".\n\nnginx:\nadd_header X-Content-Type-Options "nosniff" always;\n\nExpress:\napp.use((req, res, next) => { res.setHeader(\'X-Content-Type-Options\', \'nosniff\'); next(); });',
      conformidade: conformidade(false),
    });
  }

  const temFrameAncestors = csp !== undefined && /frame-ancestors/i.test(csp);
  if (!temFrameAncestors && primeiroValor(cabecalhos['x-frame-options']) === undefined) {
    constatacoes.push({
      tipo: 'PROTECAO_CLICKJACKING_AUSENTE',
      titulo: 'Sem proteção contra clickjacking',
      severidade: 'MEDIA',
      local: 'cabecalho:x-frame-options',
      descricao:
        'A página pode ser incorporada em frames de outros sites, permitindo ataques de clickjacking em que o usuário clica sem perceber.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, ['content-security-policy', 'x-frame-options']),
        observacao: 'Não há diretiva frame-ancestors no CSP nem o cabeçalho x-frame-options.',
      },
      correcaoSugerida:
        "Restrinja quem pode incorporar a página.\n\nnginx:\nadd_header X-Frame-Options \"DENY\" always;\n\nExpress (helmet):\napp.use(helmet.frameguard({ action: 'deny' }));",
      conformidade: conformidade(false),
    });
  }

  if (primeiroValor(cabecalhos['referrer-policy']) === undefined) {
    constatacoes.push({
      tipo: 'CABECALHO_REFERRER_POLICY_AUSENTE',
      titulo: 'Cabeçalho Referrer-Policy ausente',
      severidade: 'BAIXA',
      local: 'cabecalho:referrer-policy',
      descricao:
        'Sem uma política de referência, URLs internas (possivelmente com dados sensíveis) podem vazar para sites externos no cabeçalho Referer.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, []),
        observacao: 'A resposta não traz o cabeçalho referrer-policy.',
      },
      correcaoSugerida:
        "Defina uma política conservadora.\n\nnginx:\nadd_header Referrer-Policy \"strict-origin-when-cross-origin\" always;\n\nExpress (helmet):\napp.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));",
      conformidade: conformidade(false),
    });
  }

  if (primeiroValor(cabecalhos['permissions-policy']) === undefined) {
    constatacoes.push({
      tipo: 'CABECALHO_PERMISSIONS_POLICY_AUSENTE',
      titulo: 'Cabeçalho Permissions-Policy ausente',
      severidade: 'BAIXA',
      local: 'cabecalho:permissions-policy',
      descricao:
        'Sem Permissions-Policy, recursos do navegador como câmera, microfone e geolocalização não são restringidos explicitamente.',
      evidencia: {
        requisicao,
        resposta: descreverResposta(resposta, []),
        observacao: 'A resposta não traz o cabeçalho permissions-policy.',
      },
      correcaoSugerida:
        "Desative o que a aplicação não usa.\n\nnginx:\nadd_header Permissions-Policy \"camera=(), microphone=(), geolocation=()\" always;\n\nExpress:\napp.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); next(); });",
      conformidade: conformidade(false),
    });
  }

  return constatacoes;
}
