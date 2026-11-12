import type { Constatacao } from '@bastion/contratos';
import type { RespostaHttp } from '../../guardiao-de-escopo/cliente-http';
import {
  cabecalho,
  comParametro,
  construirConstatacao,
  descreverPedido,
  ehHtml,
  novoMarcador,
  OWASP,
  resumirResposta,
  trecho,
  type ContextoAtivo,
} from './comum';
import type { PaginaDescoberta } from './descoberta';
import {
  alvoGenerico,
  alvosDeEntrada,
  descreverEntrada,
  enviarEntrada,
  parametrosDoAlvo,
  type AlvoDeEntrada,
} from './entradas';

/** Domínio reservado (.invalid nunca resolve): serve de destino/origem de teste e nunca é requisitado. */
export const ORIGEM_DE_TESTE = 'https://bastion-teste.invalid';

// ---------------------------------------------------------------------------------------------
// Arquivos e configurações expostos
// ---------------------------------------------------------------------------------------------

interface ArquivoSensivel {
  caminho: string;
  /** O conteúdo só conta como exposto se casar com este padrão (evita falso positivo de SPA/404 mole). */
  confirma: RegExp;
  titulo: string;
  severidade: Constatacao['severidade'];
  descricao: string;
  /** Esconde valores na evidência (ex.: variáveis de ambiente). */
  mascarar?: boolean;
}

// Lista FIXA e curta: só GET, sem força bruta nem variações.
export const ARQUIVOS_SENSIVEIS: readonly ArquivoSensivel[] = [
  {
    caminho: '/.git/HEAD',
    confirma: /^ref:\s*refs\//m,
    titulo: 'Repositório Git exposto',
    severidade: 'ALTA',
    descricao: 'O diretório .git está acessível; o código-fonte e o histórico (inclusive segredos antigos) podem ser baixados.',
  },
  {
    caminho: '/.env',
    confirma: /^[A-Z][A-Z0-9_]*=.*/m,
    titulo: 'Arquivo .env exposto',
    severidade: 'CRITICA',
    descricao: 'O arquivo de variáveis de ambiente está público e costuma conter senhas, chaves de API e strings de conexão.',
    mascarar: true,
  },
  {
    caminho: '/backup.sql',
    confirma: /CREATE TABLE|INSERT INTO|DROP TABLE/i,
    titulo: 'Backup de banco de dados exposto',
    severidade: 'CRITICA',
    descricao: 'Um dump SQL está acessível publicamente e pode conter dados pessoais e credenciais.',
  },
  {
    caminho: '/config.php.bak',
    confirma: /<\?php|\$\w+\s*=/,
    titulo: 'Cópia de configuração (.bak) exposta',
    severidade: 'ALTA',
    descricao: 'Uma cópia do arquivo de configuração é servida como texto e pode revelar credenciais.',
  },
  {
    caminho: '/.htpasswd',
    confirma: /^[\w.-]+:(?:\$|\{SHA\}|[./A-Za-z0-9]{13})/m,
    titulo: 'Arquivo .htpasswd exposto',
    severidade: 'ALTA',
    descricao: 'Hashes de senha do servidor web estão acessíveis.',
    mascarar: true,
  },
  {
    caminho: '/phpinfo.php',
    confirma: /PHP Version|phpinfo\(\)/i,
    titulo: 'Página phpinfo exposta',
    severidade: 'MEDIA',
    descricao: 'A página de diagnóstico do PHP revela versões, caminhos e variáveis de ambiente.',
  },
  {
    caminho: '/server-status',
    confirma: /Apache Server Status/i,
    titulo: 'Painel server-status do Apache exposto',
    severidade: 'MEDIA',
    descricao: 'O painel de status revela requisições em andamento, URLs e endereços de clientes.',
  },
  {
    caminho: '/main.js.map',
    confirma: /"sources"\s*:\s*\[/,
    titulo: 'Source map público',
    severidade: 'BAIXA',
    descricao: 'O source map permite reconstruir o código-fonte original do front-end.',
  },
];

const CAMINHO_SECURITY_TXT = '/.well-known/security.txt';

const CORRECAO_ARQUIVO =
  'Remova o arquivo do diretório público ou bloqueie o acesso no servidor.\n\nnginx:\nlocation ~ /\\.(git|env|htpasswd) { deny all; }\nlocation ~* \\.(sql|bak|map)$ { deny all; }\n\nSe o arquivo continha segredos, considere-os vazados e rotacione-os.';

function mascararVariaveis(texto: string): string {
  return texto.replace(/^([^=\n]+)=.*$/gm, '$1=***');
}

export function analisarArquivoExposto(
  arquivo: ArquivoSensivel,
  url: string,
  resposta: RespostaHttp,
): Constatacao | null {
  if (resposta.status !== 200) return null;
  const achado = arquivo.confirma.exec(resposta.trechoDoCorpo);
  if (achado === null) return null;
  const amostra = arquivo.mascarar ? mascararVariaveis(achado[0]) : achado[0];
  return construirConstatacao({
    tipo: 'ARQUIVO_SENSIVEL_EXPOSTO',
    titulo: arquivo.titulo,
    severidade: arquivo.severidade,
    local: `caminho:${arquivo.caminho}`,
    descricao: arquivo.descricao,
    requisicao: descreverPedido('GET', url),
    resposta: `HTTP ${resposta.status}\n\n${trecho(amostra, 80)}`,
    observacao: 'O conteúdo devolvido confere com o formato esperado do arquivo; valores sensíveis foram omitidos da evidência.',
    correcao: CORRECAO_ARQUIVO,
    owasp: [OWASP.configuracao],
  });
}

export function analisarSecurityTxt(url: string, resposta: RespostaHttp | null): Constatacao | null {
  if (resposta !== null && resposta.status === 200 && /^\s*Contact:/im.test(resposta.trechoDoCorpo)) return null;
  return construirConstatacao({
    tipo: 'SECURITY_TXT_AUSENTE',
    titulo: 'Arquivo security.txt ausente',
    severidade: 'BAIXA',
    local: `caminho:${CAMINHO_SECURITY_TXT}`,
    descricao: 'Sem security.txt, pesquisadores não têm um canal oficial para reportar vulnerabilidades (RFC 9116).',
    requisicao: descreverPedido('GET', url),
    resposta: resposta === null ? 'Sem resposta utilizável' : `HTTP ${resposta.status}`,
    observacao: 'Não foi encontrado um security.txt válido com o campo Contact.',
    correcao:
      'Publique /.well-known/security.txt:\n\nContact: mailto:seguranca@exemplo.com.br\nExpires: 2027-12-31T23:59:59Z\nPreferred-Languages: pt, en',
    owasp: [OWASP.configuracao],
  });
}

const REGEX_LISTAGEM = /Index of \/|Directory listing for \/|\[To Parent Directory\]/i;
const DIRETORIOS_COMUNS = ['/images/', '/uploads/', '/static/', '/assets/', '/files/', '/backup/', '/css/', '/js/'];

export function analisarListagemDeDiretorio(url: string, resposta: RespostaHttp): Constatacao | null {
  if (resposta.status !== 200 || !REGEX_LISTAGEM.test(resposta.trechoDoCorpo)) return null;
  const caminho = new URL(url).pathname;
  return construirConstatacao({
    tipo: 'LISTAGEM_DE_DIRETORIO',
    titulo: `Listagem de diretório habilitada em ${caminho}`,
    severidade: 'MEDIA',
    local: `caminho:${caminho}`,
    descricao: 'O servidor lista o conteúdo do diretório, facilitando a descoberta de arquivos que não deveriam ser públicos.',
    requisicao: descreverPedido('GET', url),
    resposta: resumirResposta(resposta, ['content-type'], 120),
    observacao: 'A resposta contém o índice automático do diretório.',
    correcao: 'Desative a listagem.\n\nnginx: autoindex off;\nApache: Options -Indexes',
    owasp: [OWASP.configuracao],
  });
}

export async function sondarArquivosExpostos(
  contexto: ContextoAtivo,
  urlInicial: string,
  paginas: readonly PaginaDescoberta[] = [],
): Promise<Constatacao[]> {
  const origem = new URL(urlInicial).origin;
  const constatacoes: Constatacao[] = [];

  for (const arquivo of ARQUIVOS_SENSIVEIS) {
    const url = `${origem}${arquivo.caminho}`;
    const resposta = await contexto.enviar({ url });
    const constatacao = resposta === null ? null : analisarArquivoExposto(arquivo, url, resposta);
    if (constatacao !== null) constatacoes.push(constatacao);
  }

  const urlSecurity = `${origem}${CAMINHO_SECURITY_TXT}`;
  const respostaSecurity = await contexto.enviar({ url: urlSecurity });
  const securityTxt = analisarSecurityTxt(urlSecurity, respostaSecurity);
  if (securityTxt !== null) constatacoes.push(securityTxt);

  const diretorios = new Set(DIRETORIOS_COMUNS);
  for (const pagina of paginas) {
    const caminho = new URL(pagina.url).pathname;
    const pai = caminho.slice(0, caminho.lastIndexOf('/') + 1);
    if (pai.length > 1) diretorios.add(pai);
  }
  for (const diretorio of [...diretorios].slice(0, 14)) {
    const url = `${origem}${diretorio}`;
    const resposta = await contexto.enviar({ url });
    const constatacao = resposta === null ? null : analisarListagemDeDiretorio(url, resposta);
    if (constatacao !== null) constatacoes.push(constatacao);
  }
  return constatacoes;
}

// ---------------------------------------------------------------------------------------------
// CORS e métodos HTTP
// ---------------------------------------------------------------------------------------------

export function analisarCors(url: string, resposta: RespostaHttp): Constatacao | null {
  const permitida = cabecalho(resposta, 'access-control-allow-origin');
  if (permitida === undefined) return null;
  const credenciais = cabecalho(resposta, 'access-control-allow-credentials')?.toLowerCase() === 'true';
  const refletida = permitida === ORIGEM_DE_TESTE;
  const curinga = permitida === '*';
  if (!(refletida || (curinga && credenciais))) return null;

  const grave = credenciais;
  return construirConstatacao({
    tipo: 'CORS_PERMISSIVO',
    titulo: refletida ? 'CORS reflete qualquer origem' : 'CORS com curinga e credenciais',
    severidade: grave ? 'ALTA' : 'BAIXA',
    local: `cabecalho:access-control-allow-origin`,
    descricao: grave
      ? 'O servidor aceita qualquer origem e permite credenciais; um site malicioso pode ler respostas autenticadas do usuário.'
      : 'O servidor devolve a origem enviada pelo cliente em Access-Control-Allow-Origin, sem validar uma lista de origens confiáveis.',
    requisicao: `${descreverPedido('GET', url)}\norigin: ${ORIGEM_DE_TESTE}`,
    resposta: resumirResposta(resposta, ['access-control-allow-origin', 'access-control-allow-credentials'], 0),
    observacao: 'A origem de teste (domínio reservado .invalid) foi aceita.',
    correcao:
      'Valide a origem contra uma lista fixa e nunca combine credenciais com curinga.\n\nExpress (cors):\napp.use(cors({ origin: ["https://app.exemplo.com.br"], credentials: true }));',
    owasp: [OWASP.configuracao],
  });
}

const METODOS_PERIGOSOS = ['TRACE', 'PUT', 'DELETE'];

export function analisarMetodos(url: string, resposta: RespostaHttp): Constatacao | null {
  const anunciados = [cabecalho(resposta, 'allow'), cabecalho(resposta, 'access-control-allow-methods')]
    .filter((valor): valor is string => valor !== undefined)
    .flatMap((valor) => valor.split(',').map((metodo) => metodo.trim().toUpperCase()));
  const perigosos = METODOS_PERIGOSOS.filter((metodo) => anunciados.includes(metodo));
  if (perigosos.length === 0) return null;
  return construirConstatacao({
    tipo: 'METODO_HTTP_PERIGOSO',
    titulo: `Métodos HTTP perigosos habilitados: ${perigosos.join(', ')}`,
    severidade: 'MEDIA',
    local: 'metodo:OPTIONS',
    descricao:
      'O servidor anuncia métodos que alteram ou depuram recursos (TRACE, PUT, DELETE). Se estiverem ativos sem autenticação, permitem alterar ou apagar conteúdo.',
    requisicao: descreverPedido('OPTIONS', url),
    resposta: resumirResposta(resposta, ['allow', 'access-control-allow-methods'], 0),
    observacao: 'Os métodos foram apenas listados via OPTIONS; nenhum deles foi invocado.',
    correcao: 'Restrinja os métodos ao necessário.\n\nnginx: if ($request_method !~ ^(GET|HEAD|POST)$) { return 405; }\nApache: TraceEnable off',
    owasp: [OWASP.configuracao],
  });
}

export async function sondarCorsEMetodos(contexto: ContextoAtivo, urlInicial: string): Promise<Constatacao[]> {
  const constatacoes: Constatacao[] = [];
  const cors = await contexto.enviar({ url: urlInicial, cabecalhos: { origin: ORIGEM_DE_TESTE } });
  const achadoCors = cors === null ? null : analisarCors(urlInicial, cors);
  if (achadoCors !== null) constatacoes.push(achadoCors);

  const opcoes = await contexto.enviar({ url: urlInicial, metodo: 'OPTIONS' });
  const achadoMetodos = opcoes === null ? null : analisarMetodos(urlInicial, opcoes);
  if (achadoMetodos !== null) constatacoes.push(achadoMetodos);
  return constatacoes;
}

// ---------------------------------------------------------------------------------------------
// Redirecionamento aberto
// ---------------------------------------------------------------------------------------------

export const PARAMETROS_DE_REDIRECIONAMENTO = [
  'next',
  'url',
  'redirect',
  'redirect_uri',
  'return',
  'returnUrl',
  'continue',
  'dest',
  'goto',
  'target',
] as const;

export function analisarRedirecionamento(url: string, parametro: string, resposta: RespostaHttp): Constatacao | null {
  if (resposta.status < 300 || resposta.status >= 400) return null;
  const destino = cabecalho(resposta, 'location');
  if (destino === undefined) return null;
  let host: string;
  try {
    host = new URL(destino, url).hostname;
  } catch {
    return null;
  }
  if (host !== new URL(ORIGEM_DE_TESTE).hostname) return null;
  return construirConstatacao({
    tipo: 'REDIRECIONAMENTO_ABERTO',
    titulo: `Redirecionamento aberto pelo parâmetro ${parametro}`,
    severidade: 'MEDIA',
    local: `parametro:${new URL(url).pathname}?${parametro}`,
    descricao:
      'A aplicação redireciona para um destino externo informado pelo usuário, o que facilita phishing com a reputação do domínio avaliado.',
    requisicao: descreverPedido('GET', url),
    resposta: resumirResposta(resposta, ['location'], 0),
    observacao: 'O destino de teste (domínio reservado .invalid) foi aceito; o redirecionamento não foi seguido.',
    correcao:
      'Aceite apenas caminhos relativos ou uma lista fixa de destinos.\n\nconst destinoSeguro = (d) => (d.startsWith("/") && !d.startsWith("//") ? d : "/");',
    owasp: [OWASP.controleDeAcesso],
  });
}

// ---------------------------------------------------------------------------------------------
// Entrada refletida sem escape e erros detalhados
// ---------------------------------------------------------------------------------------------

/** Marcador inócuo: uma tag HTML desconhecida e vazia, sem script nem atributo executável. */
export const sondaDeReflexao = (marcador: string): string => `${marcador}<i>`;

export function analisarReflexao(
  alvo: AlvoDeEntrada,
  parametro: string,
  marcador: string,
  resposta: RespostaHttp,
): Constatacao | null {
  if (!ehHtml(resposta)) return null;
  const corpo = resposta.trechoDoCorpo;
  const posicao = corpo.indexOf(sondaDeReflexao(marcador));
  if (posicao === -1) return null;
  const caminho = new URL(alvo.url).pathname;
  return construirConstatacao({
    tipo: 'ENTRADA_REFLETIDA_SEM_ESCAPE',
    titulo: `Entrada refletida sem escape no parâmetro ${parametro}`,
    severidade: 'ALTA',
    local: `parametro:${caminho}?${parametro}`,
    descricao:
      'O valor enviado volta no HTML com os caracteres < e > intactos. É o indício clássico de XSS refletido: um atacante pode injetar marcação e scripts na página.',
    requisicao: descreverEntrada(alvo, parametro, sondaDeReflexao(marcador)),
    resposta: `HTTP ${resposta.status}\n\n…${trecho(corpo.slice(Math.max(0, posicao - 40), posicao + 80), 160)}…`,
    observacao: 'Foi usado apenas um marcador inofensivo (tag <i> vazia); nenhum script foi enviado.',
    correcao:
      'Escape toda saída conforme o contexto (HTML, atributo, JS) e adicione CSP.\n\nUse o auto-escape do template engine e evite innerHTML/dangerouslySetInnerHTML com dados do usuário.',
    owasp: [OWASP.injecao],
  });
}

export const PADROES_DE_ERRO: readonly { rotulo: string; regex: RegExp }[] = [
  { rotulo: 'stack trace Java', regex: /\bat [\w$.]+\([\w$]+\.java:\d+\)|java\.lang\.\w+Exception/ },
  { rotulo: 'stack trace Node.js', regex: /\bat [^\n(]+ \((?:[A-Za-z]:)?[^\n)]*\.(?:js|ts|mjs):\d+:\d+\)/ },
  { rotulo: 'stack trace Python', regex: /Traceback \(most recent call last\)/ },
  { rotulo: 'erro PHP', regex: /(?:Fatal error|Warning|Notice|Parse error):[^\n]{0,200} on line \d+/ },
  { rotulo: 'erro .NET', regex: /System\.\w+Exception|Server Error in '\/' Application/ },
  { rotulo: 'erro de banco MySQL', regex: /You have an error in your SQL syntax|mysqli?_|MySQLSyntaxErrorException/ },
  { rotulo: 'erro de banco PostgreSQL', regex: /PG::SyntaxError|PSQLException|unterminated quoted string/ },
  { rotulo: 'erro de banco Oracle', regex: /ORA-\d{5}/ },
  { rotulo: 'erro de banco SQL Server', regex: /Unclosed quotation mark|Microsoft OLE DB|ODBC SQL Server/ },
  { rotulo: 'erro de banco SQLite', regex: /SQLite3?::|SQLITE_ERROR|SQLSTATE\[/ },
];

export function detectarErroDetalhado(corpo: string): string | null {
  for (const padrao of PADROES_DE_ERRO) {
    if (padrao.regex.test(corpo)) return padrao.rotulo;
  }
  return null;
}

function construirErroDetalhado(
  requisicao: string,
  local: string,
  rotulo: string,
  resposta: RespostaHttp,
): Constatacao {
  const achado = PADROES_DE_ERRO.find((padrao) => padrao.rotulo === rotulo)?.regex.exec(resposta.trechoDoCorpo);
  const posicao = achado?.index ?? 0;
  return construirConstatacao({
    tipo: 'ERRO_DETALHADO_EXPOSTO',
    titulo: `Erro detalhado exposto (${rotulo})`,
    severidade: 'MEDIA',
    local,
    descricao:
      'A aplicação devolve mensagens de erro internas ao usuário, revelando tecnologias, caminhos de arquivo e estrutura do banco que ajudam um atacante.',
    requisicao,
    resposta: `HTTP ${resposta.status}\n\n…${trecho(resposta.trechoDoCorpo.slice(Math.max(0, posicao - 20), posicao + 160), 180)}…`,
    observacao: 'Uma entrada comum e inofensiva (apóstrofo ou caminho inexistente) bastou para provocar o erro.',
    correcao:
      'Desative modo debug em ambientes expostos, registre o detalhe só em log e devolva uma mensagem genérica com um identificador de correlação.',
    owasp: [OWASP.configuracao],
  });
}

export interface OpcoesDeEntradas {
  maximoDeAlvos?: number;
}

export async function sondarRedirecionamentos(
  contexto: ContextoAtivo,
  urlInicial: string,
  paginas: readonly PaginaDescoberta[] = [],
): Promise<Constatacao[]> {
  const constatacoes: Constatacao[] = [];
  const candidatos = new Map<string, string>([[new URL(urlInicial).pathname, urlInicial]]);
  for (const pagina of paginas) {
    const url = new URL(pagina.url);
    const temParametro = PARAMETROS_DE_REDIRECIONAMENTO.some((nome) => url.searchParams.has(nome));
    if ((temParametro || /login|signin|redirect|out|go|link/i.test(url.pathname)) && candidatos.size < 4) {
      url.search = '';
      candidatos.set(url.pathname, url.toString());
    }
  }
  for (const base of candidatos.values()) {
    for (const parametro of PARAMETROS_DE_REDIRECIONAMENTO) {
      const url = comParametro(base, parametro, `${ORIGEM_DE_TESTE}/redirecionamento`);
      const resposta = await contexto.enviar({ url, naoSeguirRedirecionamentos: true });
      const constatacao = resposta === null ? null : analisarRedirecionamento(url, parametro, resposta);
      if (constatacao !== null) {
        constatacoes.push(constatacao);
        break;
      }
    }
  }
  return constatacoes;
}

export async function sondarEntradaRefletida(
  contexto: ContextoAtivo,
  urlInicial: string,
  paginas: readonly PaginaDescoberta[],
  opcoes: OpcoesDeEntradas = {},
): Promise<Constatacao[]> {
  const alvos = alvosDeEntrada(paginas, contexto, opcoes.maximoDeAlvos ?? 12);
  if (alvos.length === 0) alvos.push(alvoGenerico(urlInicial));
  const constatacoes: Constatacao[] = [];
  for (const alvo of alvos) {
    for (const parametro of parametrosDoAlvo(alvo, alvo.url === urlInicial ? 7 : 4)) {
      const marcador = novoMarcador();
      const resposta = await enviarEntrada(contexto, alvo, parametro, sondaDeReflexao(marcador));
      const constatacao = resposta === null ? null : analisarReflexao(alvo, parametro, marcador, resposta);
      if (constatacao !== null) constatacoes.push(constatacao);
    }
  }
  return constatacoes;
}

export async function sondarErrosDetalhados(
  contexto: ContextoAtivo,
  urlInicial: string,
  paginas: readonly PaginaDescoberta[],
  opcoes: OpcoesDeEntradas = {},
): Promise<Constatacao[]> {
  const constatacoes: Constatacao[] = [];
  const origem = new URL(urlInicial).origin;

  const inexistente = `${origem}/bastion-teste-inexistente-${novoMarcador()}`;
  const respostaInexistente = await contexto.enviar({ url: inexistente });
  const rotuloDaPagina = respostaInexistente === null ? null : detectarErroDetalhado(respostaInexistente.trechoDoCorpo);
  if (respostaInexistente !== null && rotuloDaPagina !== null) {
    constatacoes.push(
      construirErroDetalhado(descreverPedido('GET', inexistente), 'caminho:/pagina-inexistente', rotuloDaPagina, respostaInexistente),
    );
  }

  const alvos = alvosDeEntrada(paginas, contexto, Math.min(opcoes.maximoDeAlvos ?? 12, 6));
  for (const alvo of alvos) {
    for (const parametro of parametrosDoAlvo(alvo, 2)) {
      const normal = await enviarEntrada(contexto, alvo, parametro, 'bastion-teste-ok');
      const base = normal === null ? null : detectarErroDetalhado(normal.trechoDoCorpo);
      const sonda = "bastion-teste-'";
      const resposta = await enviarEntrada(contexto, alvo, parametro, sonda);
      if (resposta === null) continue;
      const rotulo = detectarErroDetalhado(resposta.trechoDoCorpo);
      if (rotulo !== null && rotulo !== base) {
        constatacoes.push(
          construirErroDetalhado(
            descreverEntrada(alvo, parametro, sonda),
            `parametro:${new URL(alvo.url).pathname}?${parametro}`,
            rotulo,
            resposta,
          ),
        );
      }
    }
  }
  return constatacoes;
}

export interface OpcoesDoModuloWeb {
  contexto: ContextoAtivo;
  urlInicial: string;
  paginas: readonly PaginaDescoberta[];
}

/** Executa todas as sondas do perfil PADRAO de uma vez (o executor as chama por etapa). */
export async function avaliarWeb(opcoes: OpcoesDoModuloWeb): Promise<Constatacao[]> {
  const { contexto, urlInicial, paginas } = opcoes;
  return [
    ...(await sondarArquivosExpostos(contexto, urlInicial, paginas)),
    ...(await sondarCorsEMetodos(contexto, urlInicial)),
    ...(await sondarRedirecionamentos(contexto, urlInicial, paginas)),
    ...(await sondarEntradaRefletida(contexto, urlInicial, paginas)),
    ...(await sondarErrosDetalhados(contexto, urlInicial, paginas)),
  ];
}
