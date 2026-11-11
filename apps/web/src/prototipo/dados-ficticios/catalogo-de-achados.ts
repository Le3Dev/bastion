import type {
  Achado,
  EstadoDoAchado,
  HistoricoDoAchado,
  RiscoAceito,
  Severidade,
} from "../tipos";

/** Nome do ator quando o achado nasce ou reabre por uma avaliação. */
export const AUTOR_DA_AVALIACAO = "Bastion (avaliação passiva)";

const OWASP_CONFIGURACAO = "A02:2025 Configuração Incorreta de Segurança";
const OWASP_CRIPTOGRAFIA = "A04:2025 Falhas Criptográficas";
const LGPD_SEGURANCA = "Art. 46: medidas de segurança";

/** Modelo de achado do módulo PASSIVO; as etapas 1 a 4 produzem achados. */
export interface ModeloDeAchado {
  chave: string;
  /** Índice da etapa da avaliação que produz o achado (1 a 4). */
  etapaIndice: number;
  severidade: Severidade;
  titulo: string;
  tipo: string;
  local: string;
  descricao: string;
  observacao: string;
  requisicao: (host: string) => string;
  resposta: string;
  correcao: string;
  owasp: string[];
}

const get = (host: string): string =>
  `GET / HTTP/1.1\nHost: ${host}\nUser-Agent: Bastion-Avaliacao-Passiva/1.0\nAccept: text/html`;

const respostaSemCabecalho = (extra: string): string =>
  `HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nServer: nginx\n${extra}\nContent-Length: 18342`;

export const catalogoDoModuloPassivo: ModeloDeAchado[] = [
  {
    chave: "csp",
    etapaIndice: 1,
    severidade: "MEDIA",
    titulo: "Content-Security-Policy ausente",
    tipo: "CABECALHO_CSP_AUSENTE",
    local: "Cabeçalho Content-Security-Policy",
    descricao:
      "A resposta não define Content-Security-Policy. Sem a política, o navegador aceita scripts, estilos e frames de qualquer origem, o que amplia o impacto de uma falha de XSS.",
    observacao: "Nenhum cabeçalho Content-Security-Policy foi encontrado na resposta.",
    requisicao: get,
    resposta: respostaSemCabecalho("X-Request-Id: 8f2c1a"),
    correcao:
      "Defina uma política restritiva e evolua aos poucos.\n\n# nginx\nadd_header Content-Security-Policy \"default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self'\" always;\n\n// Express (helmet)\napp.use(helmet.contentSecurityPolicy({ directives: { defaultSrc: [\"'self'\"] } }));",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "hsts",
    etapaIndice: 1,
    severidade: "ALTA",
    titulo: "Strict-Transport-Security (HSTS) ausente",
    tipo: "CABECALHO_HSTS_AUSENTE",
    local: "Cabeçalho Strict-Transport-Security",
    descricao:
      "O servidor não envia HSTS. Um atacante na rede pode forçar o downgrade para HTTP e interceptar a sessão do usuário.",
    observacao: "O cabeçalho Strict-Transport-Security não foi enviado em resposta HTTPS.",
    requisicao: get,
    resposta: respostaSemCabecalho("X-Request-Id: 31d9be"),
    correcao:
      "Ative HSTS com validade longa.\n\n# nginx\nadd_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;\n\n// Express (helmet)\napp.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "xcto",
    etapaIndice: 1,
    severidade: "BAIXA",
    titulo: "X-Content-Type-Options ausente",
    tipo: "CABECALHO_XCTO_AUSENTE",
    local: "Cabeçalho X-Content-Type-Options",
    descricao:
      "Sem X-Content-Type-Options: nosniff, alguns navegadores tentam adivinhar o tipo do conteúdo e podem executar arquivos como script.",
    observacao: "O cabeçalho X-Content-Type-Options não está presente.",
    requisicao: get,
    resposta: respostaSemCabecalho("X-Request-Id: 77aa02"),
    correcao:
      "# nginx\nadd_header X-Content-Type-Options \"nosniff\" always;\n\n// Express (helmet)\napp.use(helmet.noSniff());",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "clickjacking",
    etapaIndice: 1,
    severidade: "MEDIA",
    titulo: "Proteção contra clickjacking ausente",
    tipo: "CABECALHO_CLICKJACKING_AUSENTE",
    local: "Cabeçalho X-Frame-Options / frame-ancestors",
    descricao:
      "Nem X-Frame-Options nem a diretiva frame-ancestors da CSP estão presentes. Outra página pode embutir esta em um frame invisível e induzir cliques do usuário.",
    observacao: "Nenhum controle de enquadramento (X-Frame-Options ou frame-ancestors) foi encontrado.",
    requisicao: get,
    resposta: respostaSemCabecalho("X-Request-Id: c40e9d"),
    correcao:
      "# nginx\nadd_header X-Frame-Options \"SAMEORIGIN\" always;\n# preferível, via CSP\nadd_header Content-Security-Policy \"frame-ancestors 'self'\" always;\n\n// Express (helmet)\napp.use(helmet.frameguard({ action: \"sameorigin\" }));",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "referrer",
    etapaIndice: 1,
    severidade: "BAIXA",
    titulo: "Referrer-Policy ausente",
    tipo: "CABECALHO_REFERRER_AUSENTE",
    local: "Cabeçalho Referrer-Policy",
    descricao:
      "Sem Referrer-Policy, URLs internas (com identificadores ou tokens na query) podem vazar para sites de terceiros pelo cabeçalho Referer.",
    observacao: "O cabeçalho Referrer-Policy não foi enviado.",
    requisicao: get,
    resposta: respostaSemCabecalho("X-Request-Id: 5b10f3"),
    correcao:
      "# nginx\nadd_header Referrer-Policy \"strict-origin-when-cross-origin\" always;\n\n// Express (helmet)\napp.use(helmet.referrerPolicy({ policy: \"strict-origin-when-cross-origin\" }));",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "permissions",
    etapaIndice: 1,
    severidade: "BAIXA",
    titulo: "Permissions-Policy ausente",
    tipo: "CABECALHO_PERMISSIONS_AUSENTE",
    local: "Cabeçalho Permissions-Policy",
    descricao:
      "Sem Permissions-Policy, recursos do navegador como câmera, microfone e geolocalização ficam disponíveis para qualquer conteúdo embutido na página.",
    observacao: "O cabeçalho Permissions-Policy não foi encontrado.",
    requisicao: get,
    resposta: respostaSemCabecalho("X-Request-Id: e92d71"),
    correcao:
      "# nginx\nadd_header Permissions-Policy \"camera=(), microphone=(), geolocation=()\" always;\n\n// Express\napp.use((req, res, next) => {\n  res.setHeader(\"Permissions-Policy\", \"camera=(), microphone=(), geolocation=()\");\n  next();\n});",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "tls-legado",
    etapaIndice: 2,
    severidade: "CRITICA",
    titulo: "TLS 1.0 e 1.1 habilitados",
    tipo: "TLS_PROTOCOLO_LEGADO",
    local: "Protocolo TLS",
    descricao:
      "O servidor aceita handshakes TLS 1.0 e 1.1, protocolos obsoletos com fraquezas conhecidas. Em APIs de pagamento isso também fere requisitos de conformidade.",
    observacao: "Handshake concluído com TLSv1.0 e TLSv1.1 (somente verificação de oferta de protocolo).",
    requisicao: (host) => `ClientHello (TLS 1.0) -> ${host}:443\nSNI: ${host}`,
    resposta: "ServerHello: version=TLSv1.0, cipher=TLS_RSA_WITH_AES_128_CBC_SHA\nHandshake concluído sem erro",
    correcao:
      "Aceite somente TLS 1.2 e 1.3.\n\n# nginx\nssl_protocols TLSv1.2 TLSv1.3;\nssl_prefer_server_ciphers off;\n\n// Node (https)\nhttps.createServer({ minVersion: \"TLSv1.2\", key, cert }, app);",
    owasp: [OWASP_CRIPTOGRAFIA],
  },
  {
    chave: "cert-expirando",
    etapaIndice: 2,
    severidade: "ALTA",
    titulo: "Certificado TLS expira em menos de 30 dias",
    tipo: "TLS_CERTIFICADO_EXPIRANDO",
    local: "Certificado TLS",
    descricao:
      "O certificado do servidor expira em menos de 30 dias. Se não for renovado, clientes e integrações passam a recusar a conexão.",
    observacao: "Campo notAfter do certificado a 19 dias da data da avaliação.",
    requisicao: (host) => `ClientHello -> ${host}:443\nSNI: ${host}`,
    resposta: "Certificate: CN=*.pagamentos-exemplo.com.br\nnotBefore=Aug 29 2026 GMT\nnotAfter=Nov 27 2026 GMT\nIssuer: CA Exemplo TLS",
    correcao:
      "Automatize a renovação e alerte antes do vencimento.\n\n# certbot (cron diário)\n0 3 * * * certbot renew --quiet --deploy-hook \"nginx -s reload\"",
    owasp: [OWASP_CRIPTOGRAFIA],
  },
  {
    chave: "cookie-secure",
    etapaIndice: 3,
    severidade: "ALTA",
    titulo: "Cookie de sessão sem o atributo Secure",
    tipo: "COOKIE_SEM_SECURE",
    local: "Set-Cookie: sessao (Secure)",
    descricao:
      "O cookie de sessão é emitido sem Secure e pode ser enviado em requisições HTTP sem criptografia, expondo a sessão a interceptação.",
    observacao: "Set-Cookie sem o atributo Secure.",
    requisicao: get,
    resposta: "HTTP/1.1 200 OK\nSet-Cookie: sessao=eyJ1IjoiMSJ9; Path=/; HttpOnly; SameSite=Lax\nContent-Type: text/html",
    correcao:
      "# nginx (proxy)\nproxy_cookie_flags ~ secure;\n\n// Express (express-session)\napp.use(session({ secret, cookie: { secure: true, httpOnly: true, sameSite: \"lax\" } }));",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "cookie-httponly",
    etapaIndice: 3,
    severidade: "MEDIA",
    titulo: "Cookie de sessão sem o atributo HttpOnly",
    tipo: "COOKIE_SEM_HTTPONLY",
    local: "Set-Cookie: sessao (HttpOnly)",
    descricao:
      "Sem HttpOnly, scripts da página conseguem ler o cookie. Uma falha de XSS passa a permitir o roubo direto da sessão.",
    observacao: "Set-Cookie sem o atributo HttpOnly.",
    requisicao: get,
    resposta: "HTTP/1.1 200 OK\nSet-Cookie: preferencias=tema%3Descuro; Path=/; Secure; SameSite=Lax\nContent-Type: text/html",
    correcao:
      "# nginx (proxy)\nproxy_cookie_flags ~ httponly;\n\n// Express\nres.cookie(\"preferencias\", valor, { httpOnly: true, secure: true, sameSite: \"lax\" });",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "cookie-samesite",
    etapaIndice: 3,
    severidade: "MEDIA",
    titulo: "Cookie sem o atributo SameSite",
    tipo: "COOKIE_SEM_SAMESITE",
    local: "Set-Cookie: sessao (SameSite)",
    descricao:
      "Sem SameSite, o cookie acompanha requisições originadas em outros sites, facilitando ataques de CSRF.",
    observacao: "Set-Cookie sem o atributo SameSite.",
    requisicao: get,
    resposta: "HTTP/1.1 200 OK\nSet-Cookie: carrinho=a91f; Path=/; Secure; HttpOnly\nContent-Type: text/html",
    correcao:
      "# nginx (proxy)\nproxy_cookie_flags ~ samesite=lax;\n\n// Express\nres.cookie(\"carrinho\", valor, { sameSite: \"lax\", secure: true, httpOnly: true });",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "server-versao",
    etapaIndice: 4,
    severidade: "BAIXA",
    titulo: "Versão do servidor exposta no cabeçalho Server",
    tipo: "VERSAO_EXPOSTA_SERVER",
    local: "Cabeçalho Server",
    descricao:
      "O cabeçalho Server revela a versão exata do nginx, o que ajuda um atacante a procurar vulnerabilidades conhecidas dessa versão.",
    observacao: "Server: nginx/1.18.0.",
    requisicao: get,
    resposta: "HTTP/1.1 200 OK\nServer: nginx/1.18.0 (Ubuntu)\nContent-Type: text/html",
    correcao: "# nginx.conf (bloco http)\nserver_tokens off;",
    owasp: [OWASP_CONFIGURACAO],
  },
  {
    chave: "x-powered-by",
    etapaIndice: 4,
    severidade: "MEDIA",
    titulo: "Versão do PHP exposta em X-Powered-By",
    tipo: "VERSAO_EXPOSTA_X_POWERED_BY",
    local: "Cabeçalho X-Powered-By",
    descricao:
      "O cabeçalho X-Powered-By expõe PHP/7.4.3, uma versão sem suporte de segurança, e indica o que explorar.",
    observacao: "X-Powered-By: PHP/7.4.3.",
    requisicao: get,
    resposta: "HTTP/1.1 200 OK\nServer: nginx\nX-Powered-By: PHP/7.4.3\nContent-Type: text/html",
    correcao:
      "; php.ini\nexpose_php = Off\n\n# nginx\nfastcgi_hide_header X-Powered-By;\n\n// Express\napp.disable(\"x-powered-by\");",
    owasp: [OWASP_CONFIGURACAO],
  },
];

export interface ParametrosDoAchadoDoModelo {
  id: string;
  sistemaId: string;
  host: string;
  modelo: ModeloDeAchado;
  estado: EstadoDoAchado;
  ocorrencias: number;
  avaliacaoIds: string[];
  primeiraVezEm: string;
  ultimaVezEm: string;
  historico: HistoricoDoAchado[];
  riscoAceito?: RiscoAceito;
}

export const criarAchadoDoModelo = (p: ParametrosDoAchadoDoModelo): Achado => ({
  id: p.id,
  sistemaId: p.sistemaId,
  titulo: p.modelo.titulo,
  tipo: p.modelo.tipo,
  local: p.modelo.local,
  severidade: p.modelo.severidade,
  estado: p.estado,
  impressaoDigital: `${p.sistemaId}:${p.modelo.tipo}:${p.modelo.local}`,
  descricao: p.modelo.descricao,
  evidencia: {
    requisicao: p.modelo.requisicao(p.host),
    resposta: p.modelo.resposta,
    observacao: p.modelo.observacao,
  },
  correcaoSugerida: p.modelo.correcao,
  conformidade: { owasp: p.modelo.owasp, lgpd: [LGPD_SEGURANCA] },
  ocorrencias: p.ocorrencias,
  avaliacaoIds: p.avaliacaoIds,
  primeiraVezEm: p.primeiraVezEm,
  ultimaVezEm: p.ultimaVezEm,
  historico: p.historico,
  ...(p.riscoAceito ? { riscoAceito: p.riscoAceito } : {}),
});
