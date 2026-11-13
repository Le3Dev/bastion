import type { EscopoDaTarefa } from '@bastion/contratos';
import { ehHtml, type ContextoAtivo } from './comum';

export interface CampoDoFormulario {
  nome: string;
  tipo: string;
  valor: string;
}

export interface FormularioDescoberto {
  /** URL absoluta de destino do formulário. */
  acao: string;
  metodo: 'GET' | 'POST';
  campos: CampoDoFormulario[];
  /** Campo oculto que parece ser token anti-CSRF, quando existe. */
  tokenCsrf: { nome: string; valor: string } | null;
}

export interface PaginaDescoberta {
  url: string;
  metodo: 'GET';
  status: number;
  formularios: FormularioDescoberto[];
  /** Tamanho do trecho do corpo recebido (para comparar respostas sem guardar conteúdo). */
  tamanhoDoCorpo: number;
  /** Nomes de parâmetros de query vistos em URLs descobertas para o mesmo caminho. */
  parametros: string[];
}

const EXTENSOES_IGNORADAS =
  /\.(?:png|jpe?g|gif|svg|ico|webp|css|js|mjs|map|woff2?|ttf|eot|pdf|zip|gz|tar|mp[34]|avi|mov|docx?|xlsx?|pptx?)$/i;
// Links que, por convenção, mudam estado mesmo via GET: nunca são seguidos.
const CAMINHOS_PERIGOSOS = /(?:logout|logoff|signout|sign-out|sair|delete|excluir|remover|destroy|apagar|desativar)/i;
const REGEX_CSRF = /csrf|xsrf|authenticity|_token|anti-?forgery|nonce/i;

function decodificar(texto: string): string {
  return texto
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function lerAtributos(texto: string): Record<string, string> {
  const atributos: Record<string, string> = {};
  const regex = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const achado of texto.matchAll(regex)) {
    const nome = achado[1]?.toLowerCase();
    if (nome === undefined || nome in atributos) continue;
    atributos[nome] = decodificar(achado[2] ?? achado[3] ?? achado[4] ?? '');
  }
  return atributos;
}

function resolver(referencia: string, base: string): string | null {
  const limpa = referencia.trim();
  if (limpa === '' || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(limpa)) return null;
  try {
    const url = new URL(limpa, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function extrairLinks(html: string, base: string): string[] {
  const links = new Set<string>();
  for (const achado of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = lerAtributos(achado[1] ?? '')['href'];
    const url = href === undefined ? null : resolver(href, base);
    if (url !== null) links.add(url);
  }
  return [...links];
}

export function extrairFormularios(html: string, base: string): FormularioDescoberto[] {
  const formularios: FormularioDescoberto[] = [];
  for (const achado of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const atributos = lerAtributos(achado[1] ?? '');
    const acao = resolver(atributos['action'] ?? '', base) ?? resolver(base, base);
    if (acao === null) continue;
    const metodo = (atributos['method'] ?? 'get').toUpperCase() === 'POST' ? 'POST' : 'GET';
    const campos: CampoDoFormulario[] = [];
    for (const campo of (achado[2] ?? '').matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const a = lerAtributos(campo[2] ?? '');
      const nome = a['name'];
      if (nome === undefined || nome === '') continue;
      const tipo = campo[1]?.toLowerCase() === 'input' ? (a['type'] ?? 'text').toLowerCase() : (campo[1] ?? 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'image', 'file'].includes(tipo)) continue;
      campos.push({ nome, tipo, valor: a['value'] ?? '' });
    }
    const csrf = campos.find((campo) => campo.tipo === 'hidden' && REGEX_CSRF.test(campo.nome));
    formularios.push({
      acao,
      metodo,
      campos,
      tokenCsrf: csrf ? { nome: csrf.nome, valor: csrf.valor } : null,
    });
  }
  return formularios;
}

export function caminhoExcluido(escopo: Pick<EscopoDaTarefa, 'caminhosExcluidos'>, url: string): boolean {
  try {
    const caminho = new URL(url).pathname;
    return escopo.caminhosExcluidos.some((prefixo) => prefixo !== '' && caminho.startsWith(prefixo));
  } catch {
    return true;
  }
}

const MAXIMO_DE_SEMENTES = 40;

/** Caminhos comuns de aplicações web, tentados só com GET além dos links encontrados. */
export const CAMINHOS_COMUNS: readonly string[] = [
  '/login',
  '/admin',
  '/api',
  '/busca',
  '/conta',
  '/produtos',
  '/uploads/',
  '/perfil',
  '/painel',
];

/** Caminhos concretos (sem curingas) das linhas Allow/Disallow do robots.txt. */
export function extrairUrlsDoRobots(texto: string | null, origem: string): string[] {
  if (texto === null) return [];
  const urls = new Set<string>();
  for (const achado of texto.matchAll(/^\s*(?:allow|disallow)\s*:\s*(\S+)/gim)) {
    const caminho = achado[1] ?? '';
    if (!caminho.startsWith('/') || /[*$]/.test(caminho)) continue;
    const url = resolver(caminho, origem);
    if (url !== null) urls.add(url);
  }
  return [...urls];
}

/** URLs das tags `<loc>` de um sitemap.xml. */
export function extrairUrlsDoSitemap(texto: string | null, origem: string): string[] {
  if (texto === null || !/<(?:urlset|sitemapindex)\b/i.test(texto)) return [];
  const urls = new Set<string>();
  for (const achado of texto.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const url = resolver(decodificar(achado[1] ?? ''), origem);
    if (url !== null) urls.add(url);
  }
  return [...urls];
}

export interface OpcoesDeDescoberta {
  contexto: ContextoAtivo;
  urlInicial: string;
  maximoDePaginas?: number;
  profundidadeMaxima?: number;
}

/**
 * Rastreamento leve e só de leitura (GET): segue `href` e `action` do mesmo host, respeita os
 * caminhos excluídos e nunca segue links com cara de sair/apagar.
 */
export async function descobrirPaginas(opcoes: OpcoesDeDescoberta): Promise<PaginaDescoberta[]> {
  const { contexto } = opcoes;
  const maximo = opcoes.maximoDePaginas ?? 50;
  const profundidadeMaxima = opcoes.profundidadeMaxima ?? 2;
  const inicial = new URL(opcoes.urlInicial);
  inicial.hash = '';
  const hostBase = inicial.host;
  const hostsPermitidos = new Set(contexto.escopo.hostsPermitidos.map((h) => h.toLowerCase()));

  const paginas: PaginaDescoberta[] = [];
  const vistas = new Set<string>([inicial.toString()]);
  const fila: { url: string; profundidade: number }[] = [{ url: inicial.toString(), profundidade: 0 }];
  const sementes: { url: string; profundidade: number }[] = [];
  const parametrosPorCaminho = new Map<string, Set<string>>();

  const registrarParametros = (url: string): void => {
    const alvo = new URL(url);
    for (const nome of alvo.searchParams.keys()) {
      const conjunto = parametrosPorCaminho.get(alvo.pathname) ?? new Set<string>();
      conjunto.add(nome);
      parametrosPorCaminho.set(alvo.pathname, conjunto);
    }
  };
  registrarParametros(inicial.toString());

  const aceitar = (url: string): boolean => {
    const alvo = new URL(url);
    return (
      alvo.host === hostBase &&
      hostsPermitidos.has(alvo.hostname.toLowerCase()) &&
      !EXTENSOES_IGNORADAS.test(alvo.pathname) &&
      !CAMINHOS_PERIGOSOS.test(alvo.pathname) &&
      !caminhoExcluido(contexto.escopo, url)
    );
  };

  // Sementes extras (robots.txt, sitemap.xml e caminhos comuns): só entram depois dos links da página inicial.
  const semear = (url: string): void => {
    if (sementes.length >= MAXIMO_DE_SEMENTES || vistas.has(url) || !aceitar(url)) return;
    vistas.add(url);
    registrarParametros(url);
    sementes.push({ url, profundidade: 1 });
  };
  const lerTexto = async (caminho: string): Promise<string | null> => {
    const resposta = await contexto.enviar({ url: new URL(caminho, inicial.origin).toString() });
    if (resposta === null || resposta.status < 200 || resposta.status >= 300) return null;
    return resposta.trechoDoCorpo;
  };
  for (const url of extrairUrlsDoRobots(await lerTexto('/robots.txt'), inicial.origin)) semear(url);
  for (const url of extrairUrlsDoSitemap(await lerTexto('/sitemap.xml'), inicial.origin)) semear(url);
  for (const caminho of CAMINHOS_COMUNS) semear(new URL(caminho, inicial.origin).toString());

  while (paginas.length < maximo) {
    const atual = fila.shift() ?? sementes.shift();
    if (atual === undefined) break;
    const resposta = await contexto.enviar({ url: atual.url });
    if (resposta === null) continue;
    const htmlComSucesso = resposta.status >= 200 && resposta.status < 300 && ehHtml(resposta);
    if (!htmlComSucesso) {
      // URL com parâmetros que respondeu (texto, JSON, 5xx...) entra para as sondas de entrada; sem extrair links.
      if (resposta.status !== 404 && new URL(atual.url).search !== '') {
        paginas.push({ url: atual.url, metodo: 'GET', status: resposta.status, formularios: [],
          tamanhoDoCorpo: resposta.trechoDoCorpo.length, parametros: [] });
      }
      continue;
    }

    const formularios = extrairFormularios(resposta.trechoDoCorpo, resposta.url);
    paginas.push({ url: atual.url, metodo: 'GET', status: resposta.status,
      formularios,
      tamanhoDoCorpo: resposta.trechoDoCorpo.length,
      parametros: [],
    });
    for (const formulario of formularios) {
      if (formulario.metodo === 'GET') {
        const destino = new URL(formulario.acao);
        for (const campo of formulario.campos) {
          const conjunto = parametrosPorCaminho.get(destino.pathname) ?? new Set<string>();
          conjunto.add(campo.nome);
          parametrosPorCaminho.set(destino.pathname, conjunto);
        }
      }
    }
    if (atual.profundidade >= profundidadeMaxima) continue;

    const candidatos = [
      ...extrairLinks(resposta.trechoDoCorpo, resposta.url),
      ...formularios.map((formulario) => formulario.acao),
    ];
    for (const candidato of candidatos) {
      if (vistas.has(candidato) || !aceitar(candidato)) continue;
      vistas.add(candidato);
      registrarParametros(candidato);
      fila.push({ url: candidato, profundidade: atual.profundidade + 1 });
    }
  }
  for (const pagina of paginas) {
    pagina.parametros = [...(parametrosPorCaminho.get(new URL(pagina.url).pathname) ?? [])];
  }
  return paginas;
}
