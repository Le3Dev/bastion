import type { Constatacao, CredencialDeTeste } from '@bastion/contratos';
import type { RespostaHttp } from '../../guardiao-de-escopo/cliente-http';
import {
  cabecalho,
  construirConstatacao,
  descreverPedido,
  montarContexto,
  novoMarcador,
  OWASP,
  resumirResposta,
  trecho,
  ocultarNaConstatacao,
  type ContextoAtivo,
  type PedidoDoModulo,
} from './comum';
import { extrairFormularios, type PaginaDescoberta } from './descoberta';
import {
  alvosDeEntrada,
  descreverEntrada,
  enviarEntrada,
  parametrosDoAlvo,
  type AlvoDeEntrada,
} from './entradas';
import { detectarErroDetalhado, sondarEntradaRefletida, sondarErrosDetalhados, sondarRedirecionamentos } from './web';

/** O login de teste não funcionou; a mensagem nunca inclui usuário nem senha. */
export class FalhaDeAutenticacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'FalhaDeAutenticacao';
  }
}

export interface SessaoDeTeste {
  /** Contexto que reenvia cookies/token de sessão e refaz o login se a sessão cair. */
  contexto: ContextoAtivo;
  /** O mesmo alvo, sem nenhuma credencial (para provar acesso anônimo). */
  semSessao: ContextoAtivo;
  /** Quantas vezes o login foi refeito (informativo). */
  relogins(): number;
}

const NOMES_DE_TOKEN = ['access_token', 'accessToken', 'token', 'jwt', 'id_token'];
const MAXIMO_DE_SALTOS = 5;

function lerCookies(resposta: RespostaHttp, jar: Map<string, string>): void {
  const bruto = resposta.cabecalhos['set-cookie'];
  const lista = bruto === undefined ? [] : Array.isArray(bruto) ? bruto : [bruto];
  for (const cookie of lista) {
    const partes = cookie.split(';').map((parte) => parte.trim());
    const [par, ...atributos] = partes;
    const igual = par?.indexOf('=') ?? -1;
    if (par === undefined || igual <= 0) continue;
    const nome = par.slice(0, igual);
    const valor = par.slice(igual + 1);
    const expirado = atributos.some((a) => /^max-age=0$/i.test(a)) || (valor === '' && atributos.some((a) => /^expires=/i.test(a)));
    if (expirado) jar.delete(nome);
    else jar.set(nome, valor);
  }
}

const temCampoDeSenha = (corpo: string): boolean => /<input\b[^>]*type\s*=\s*["']?password/i.test(corpo);

function corresponde(resposta: RespostaHttp, indicador: string): boolean {
  return resposta.trechoDoCorpo.includes(indicador) || resposta.url.includes(indicador);
}

function extrairToken(corpo: string): string | null {
  try {
    const dados: unknown = JSON.parse(corpo);
    const procurar = (no: unknown, nivel: number): string | null => {
      if (typeof no !== 'object' || no === null || nivel > 2) return null;
      for (const nome of NOMES_DE_TOKEN) {
        const valor = (no as Record<string, unknown>)[nome];
        if (typeof valor === 'string' && valor !== '') return valor;
      }
      for (const valor of Object.values(no)) {
        const achado = procurar(valor, nivel + 1);
        if (achado !== null) return achado;
      }
      return null;
    };
    return procurar(dados, 0);
  } catch {
    return null;
  }
}

export interface OpcoesDeAutenticacao {
  contexto: ContextoAtivo;
  credencial: CredencialDeTeste;
}

/**
 * Faz o login de teste (formulário ou JSON) e devolve uma sessão que reenvia os cookies.
 * Usuário e senha só vão no corpo do POST de login; não entram em log, erro nem evidência.
 */
export async function autenticar(opcoes: OpcoesDeAutenticacao): Promise<SessaoDeTeste> {
  const { contexto: base, credencial } = opcoes;
  const jar = new Map<string, string>();
  let token: string | null = null;
  let relogins = 0;
  let refazendo = false;
  const urlDeLogin = new URL(credencial.urlDeLogin);

  const requisitarBruto = async (pedido: PedidoDoModulo): Promise<RespostaHttp> => {
    let atual: PedidoDoModulo = pedido;
    for (let salto = 0; ; salto++) {
      const cabecalhos: Record<string, string> = { ...atual.cabecalhos };
      if (new URL(atual.url).host === urlDeLogin.host) {
        if (jar.size > 0) cabecalhos['cookie'] = [...jar].map(([nome, valor]) => `${nome}=${valor}`).join('; ');
        if (token !== null) cabecalhos['authorization'] = `Bearer ${token}`;
      }
      const resposta = await base.requisitar({ ...atual, cabecalhos, naoSeguirRedirecionamentos: true });
      lerCookies(resposta, jar);
      const destino = cabecalho(resposta, 'location');
      const redireciona = resposta.status >= 300 && resposta.status < 400 && destino !== undefined;
      if (!redireciona || pedido.naoSeguirRedirecionamentos === true || salto >= MAXIMO_DE_SALTOS) return resposta;
      atual = { url: new URL(destino, resposta.url).toString(), metodo: 'GET', intencao: 'LEITURA' };
    }
  };

  const logar = async (): Promise<void> => {
    jar.clear();
    token = null;
    if (credencial.modo === 'JSON') {
      const resposta = await requisitarBruto({
        url: credencial.urlDeLogin,
        metodo: 'POST',
        intencao: 'AUTENTICACAO',
        cabecalhos: { 'content-type': 'application/json', accept: 'application/json' },
        corpo: JSON.stringify({ [credencial.campoUsuario]: credencial.usuario, [credencial.campoSenha]: credencial.senha }),
      });
      if (resposta.status >= 400) throw new FalhaDeAutenticacao(`O login de teste foi recusado (HTTP ${resposta.status}).`);
      token = extrairToken(resposta.trechoDoCorpo);
      const confirmado = credencial.indicadorDeSucesso !== '' ? corresponde(resposta, credencial.indicadorDeSucesso) : token !== null;
      if (!confirmado) throw new FalhaDeAutenticacao('O login de teste não retornou o indicador de sucesso esperado.');
      return;
    }

    const pagina = await requisitarBruto({ url: credencial.urlDeLogin });
    const formularios = extrairFormularios(pagina.trechoDoCorpo, pagina.url);
    const formulario =
      formularios.find((f) => f.campos.some((c) => c.nome === credencial.campoSenha || c.tipo === 'password')) ??
      formularios[0];
    const campos: Record<string, string> = {};
    for (const campo of formulario?.campos ?? []) campos[campo.nome] = campo.valor;
    campos[credencial.campoUsuario] = credencial.usuario;
    campos[credencial.campoSenha] = credencial.senha;
    const resposta = await requisitarBruto({
      url: formulario?.acao ?? credencial.urlDeLogin,
      metodo: 'POST',
      intencao: 'AUTENTICACAO',
      cabecalhos: { 'content-type': 'application/x-www-form-urlencoded' },
      corpo: new URLSearchParams(campos).toString(),
    });
    if (resposta.status >= 400) throw new FalhaDeAutenticacao(`O login de teste foi recusado (HTTP ${resposta.status}).`);
    if (!corresponde(resposta, credencial.indicadorDeSucesso) || temCampoDeSenha(resposta.trechoDoCorpo)) {
      throw new FalhaDeAutenticacao('O login de teste não retornou o indicador de sucesso esperado.');
    }
  };

  await logar();

  const sessaoCaiu = (pedido: PedidoDoModulo, resposta: RespostaHttp): boolean => {
    if (resposta.status === 401) return true;
    const destino = cabecalho(resposta, 'location');
    if (resposta.status >= 300 && resposta.status < 400 && destino !== undefined) {
      return new URL(destino, resposta.url).pathname === urlDeLogin.pathname && new URL(pedido.url).pathname !== urlDeLogin.pathname;
    }
    return new URL(resposta.url).pathname === urlDeLogin.pathname && new URL(pedido.url).pathname !== urlDeLogin.pathname;
  };

  const requisitar = async (pedido: PedidoDoModulo): Promise<RespostaHttp> => {
    const resposta = await requisitarBruto(pedido);
    if (refazendo || !sessaoCaiu(pedido, resposta)) return resposta;
    refazendo = true;
    try {
      await logar();
      relogins += 1;
      return await requisitarBruto(pedido);
    } finally {
      refazendo = false;
    }
  };

  return { contexto: montarContexto(base, requisitar), semSessao: base, relogins: () => relogins };
}

// ---------------------------------------------------------------------------------------------
// Páginas autenticadas acessíveis sem sessão
// ---------------------------------------------------------------------------------------------

const chaveDaPagina = (url: string): string => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

export async function sondarPaginasSemSessao(
  sessao: SessaoDeTeste,
  autenticadas: readonly PaginaDescoberta[],
  anonimas: readonly PaginaDescoberta[],
  maximo = 15,
): Promise<Constatacao[]> {
  const publicas = new Set(anonimas.map((pagina) => chaveDaPagina(pagina.url)));
  const constatacoes: Constatacao[] = [];
  const candidatas = autenticadas.filter((pagina) => !publicas.has(chaveDaPagina(pagina.url))).slice(0, maximo);
  for (const pagina of candidatas) {
    const resposta = await sessao.semSessao.enviar({ url: pagina.url, naoSeguirRedirecionamentos: true });
    if (resposta === null || resposta.status !== 200 || temCampoDeSenha(resposta.trechoDoCorpo)) continue;
    const maior = Math.max(resposta.trechoDoCorpo.length, pagina.tamanhoDoCorpo, 1);
    if (Math.abs(resposta.trechoDoCorpo.length - pagina.tamanhoDoCorpo) / maior > 0.2) continue;
    constatacoes.push(
      construirConstatacao({
        tipo: 'PAGINA_SENSIVEL_SEM_AUTENTICACAO',
        titulo: `Página da área autenticada acessível sem login: ${new URL(pagina.url).pathname}`,
        severidade: 'ALTA',
        local: `caminho:${new URL(pagina.url).pathname}`,
        descricao:
          'Uma página alcançada apenas depois do login responde com o mesmo conteúdo para um visitante anônimo, o que expõe dados da área restrita.',
        requisicao: descreverPedido('GET', pagina.url),
        resposta: resumirResposta(resposta, ['content-type'], 120),
        observacao: 'A requisição foi feita sem cookies nem token e devolveu HTTP 200 com conteúdo equivalente ao da sessão.',
        correcao: 'Exija autenticação em toda rota restrita no servidor (middleware global) e negue por padrão.',
        owasp: [OWASP.controleDeAcesso, OWASP.autenticacao],
      }),
    );
  }
  return constatacoes;
}

// ---------------------------------------------------------------------------------------------
// Controle de acesso: troca de identificadores sequenciais (somente leitura)
// ---------------------------------------------------------------------------------------------

const PARAMETROS_DE_ID = /^(?:id|uid|user_?id|pedido|order|order_?id|conta|account|doc|documento)$/i;
const ID_INEXISTENTE = '2147483000';

interface AlvoDeId {
  montar(id: string): string;
  idAtual: number;
  rotulo: string;
}

function localizarAlvoDeId(urlTexto: string): AlvoDeId | null {
  const url = new URL(urlTexto);
  for (const [nome, valor] of url.searchParams) {
    if (PARAMETROS_DE_ID.test(nome) && /^\d{1,9}$/.test(valor)) {
      return {
        idAtual: Number(valor),
        rotulo: `parametro:${url.pathname}?${nome}`,
        montar: (id) => {
          const copia = new URL(urlTexto);
          copia.searchParams.set(nome, id);
          return copia.toString();
        },
      };
    }
  }
  const segmentos = url.pathname.split('/');
  const indice = segmentos.findLastIndex((segmento) => /^\d{1,9}$/.test(segmento));
  if (indice === -1) return null;
  const idAtual = Number(segmentos[indice]);
  return {
    idAtual,
    rotulo: `caminho:${url.pathname}`,
    montar: (id) => {
      const copia = new URL(urlTexto);
      const novos = [...segmentos];
      novos[indice] = id;
      copia.pathname = novos.join('/');
      return copia.toString();
    },
  };
}

export async function sondarControleDeAcesso(
  sessao: SessaoDeTeste,
  paginas: readonly PaginaDescoberta[],
  maximo = 6,
): Promise<Constatacao[]> {
  const constatacoes: Constatacao[] = [];
  const vistos = new Set<string>();
  for (const pagina of paginas) {
    if (vistos.size >= maximo) break;
    const alvo = localizarAlvoDeId(pagina.url);
    if (alvo === null || vistos.has(alvo.rotulo)) continue;
    vistos.add(alvo.rotulo);

    const original = await sessao.contexto.enviar({ url: pagina.url });
    if (original === null || original.status !== 200) continue;
    const controle = await sessao.contexto.enviar({ url: alvo.montar(ID_INEXISTENTE) });
    if (controle === null || controle.status === 200) continue; // sem contraste confiável

    for (const outro of [alvo.idAtual + 1, alvo.idAtual - 1].filter((n) => n > 0)) {
      const urlOutro = alvo.montar(String(outro));
      const resposta = await sessao.contexto.enviar({ url: urlOutro });
      if (resposta === null || resposta.status !== 200) continue;
      if (resposta.trechoDoCorpo === original.trechoDoCorpo) continue;
      constatacoes.push(
        construirConstatacao({
          tipo: 'CONTROLE_DE_ACESSO_QUEBRADO',
          titulo: `Recurso de outro identificador acessível (${alvo.rotulo.replace(/^[a-z]+:/, '')})`,
          severidade: 'MEDIA',
          local: alvo.rotulo,
          descricao:
            'Trocar o identificador numérico na URL devolve outro recurso com HTTP 200, enquanto um identificador inexistente é recusado. Se o recurso pertencer a outro usuário, há acesso indevido a dados (IDOR/BOLA).',
          requisicao: descreverPedido('GET', urlOutro),
          resposta: resumirResposta(resposta, ['content-type'], 120),
          observacao: `Identificador original ${alvo.idAtual}; identificador testado ${outro}. Só leitura. Confirme manualmente se o recurso pertence a outra conta antes de classificar como incidente.`,
          correcao:
            'Valide no servidor se o usuário autenticado é dono do recurso (checagem de autorização por objeto) e prefira identificadores não sequenciais (UUID).',
          owasp: [OWASP.controleDeAcesso],
        }),
      );
      break;
    }
  }
  return constatacoes;
}

// ---------------------------------------------------------------------------------------------
// Injeção: SQL (erro e booleana), template e travessia de caminho
// ---------------------------------------------------------------------------------------------

/** Cargas fixas e de leitura: nunca `;`, `DROP`, `UNION` com escrita nem comandos. */
const PARES_BOOLEANOS: readonly { verdadeiro: string; falso: string; rotulo: string }[] = [
  { verdadeiro: '1 AND 1=1', falso: '1 AND 1=2', rotulo: 'numérica' },
  { verdadeiro: "1' AND '1'='1", falso: "1' AND '1'='2", rotulo: 'texto' },
];
const VALOR_DE_ERRO_SQL = "1'";

const similares = (a: RespostaHttp, b: RespostaHttp): boolean => {
  if (a.status !== b.status) return false;
  const maior = Math.max(a.trechoDoCorpo.length, b.trechoDoCorpo.length);
  return Math.abs(a.trechoDoCorpo.length - b.trechoDoCorpo.length) <= Math.max(10, maior * 0.02);
};

const PARAMETROS_DE_ARQUIVO = /^(?:file|filename|path|page|template|doc|document|include|inc|dir|folder|f|name|view|lang)$/i;
const CARGAS_DE_TRAVESSIA = [
  '../../../../../../../../etc/passwd',
  '....//....//....//....//....//....//etc/passwd',
  '..\\..\\..\\..\\..\\..\\windows\\win.ini',
];
const PADROES_DE_ARQUIVO_PUBLICO: readonly { regex: RegExp; fragmento: RegExp }[] = [
  { regex: /root:[x*!]?:0:0:/, fragmento: /root:[x*!]?:0:0:/ },
  { regex: /\[fonts\]|for 16-bit app support/i, fragmento: /\[fonts\]|for 16-bit app support/i },
];

function construirSql(
  alvo: AlvoDeEntrada,
  parametro: string,
  requisicao: string,
  resposta: RespostaHttp,
  metodo: string,
  observacao: string,
): Constatacao {
  return construirConstatacao({
    tipo: 'INJECAO_SQL',
    titulo: `Injeção de SQL no parâmetro ${parametro} (${metodo})`,
    severidade: 'CRITICA',
    local: `parametro:${new URL(alvo.url).pathname}?${parametro}`,
    descricao:
      'O parâmetro altera a consulta ao banco de dados: o comportamento da aplicação muda conforme uma condição SQL injetada. Um atacante pode ler ou modificar dados e, em alguns casos, assumir o servidor.',
    requisicao,
    resposta: resumirResposta(resposta, [], 140),
    observacao,
    correcao:
      'Use consultas parametrizadas (prepared statements) ou um ORM; nunca concatene entrada em SQL.\n\nconst linhas = await db.query("SELECT * FROM itens WHERE id = $1", [id]);',
    owasp: [OWASP.injecao],
  });
}

export async function sondarInjecaoSql(contexto: ContextoAtivo, alvo: AlvoDeEntrada, parametro: string): Promise<Constatacao | null> {
  const base = await enviarEntrada(contexto, alvo, parametro, '1');
  if (base === null) return null;

  const erro = await enviarEntrada(contexto, alvo, parametro, VALOR_DE_ERRO_SQL);
  if (erro !== null) {
    const rotulo = detectarErroDetalhado(erro.trechoDoCorpo);
    const rotuloBase = detectarErroDetalhado(base.trechoDoCorpo);
    if (rotulo !== null && rotulo.startsWith('erro de banco') && rotulo !== rotuloBase) {
      return construirSql(
        alvo,
        parametro,
        descreverEntrada(alvo, parametro, VALOR_DE_ERRO_SQL),
        erro,
        'por erro',
        `O apóstrofo isolado provocou ${rotulo} que não existe na resposta normal.`,
      );
    }
  }

  if (alvo.metodo !== 'GET') return null; // em POST o valor ganha prefixo de teste: a comparação booleana perde sentido
  for (const par of PARES_BOOLEANOS) {
    const verdadeira = await enviarEntrada(contexto, alvo, parametro, par.verdadeiro);
    const falsa = await enviarEntrada(contexto, alvo, parametro, par.falso);
    if (verdadeira === null || falsa === null) continue;
    if (!similares(base, verdadeira) || similares(base, falsa)) continue;
    // Confirmação: a base e a condição falsa precisam se repetir.
    const baseDeNovo = await enviarEntrada(contexto, alvo, parametro, '1');
    const falsaDeNovo = await enviarEntrada(contexto, alvo, parametro, par.falso);
    if (baseDeNovo === null || falsaDeNovo === null) continue;
    if (similares(base, baseDeNovo) && similares(falsa, falsaDeNovo) && !similares(baseDeNovo, falsaDeNovo)) {
      return construirSql(
        alvo,
        parametro,
        descreverEntrada(alvo, parametro, par.falso),
        falsa,
        'booleana',
        `A condição verdadeira (${par.verdadeiro}) manteve a resposta e a falsa (${par.falso}) a alterou, de forma repetível (variante ${par.rotulo}).`,
      );
    }
  }
  return null;
}

/** Quatro sintaxes de template numa só requisição; o marcador identifica qual foi avaliada. */
export async function sondarInjecaoDeTemplate(
  contexto: ContextoAtivo,
  alvo: AlvoDeEntrada,
  parametro: string,
): Promise<Constatacao | null> {
  const m = novoMarcador();
  const sintaxes: readonly { sufixo: string; carga: string; nome: string }[] = [
    { sufixo: 'a', carga: '{{83*97}}', nome: '{{ }} (Jinja2/Twig/Handlebars)' },
    { sufixo: 'b', carga: '${83*97}', nome: '${ } (FreeMarker/EL)' },
    { sufixo: 'c', carga: '<%= 83*97 %>', nome: '<%= %> (ERB/EJS)' },
    { sufixo: 'd', carga: '#{83*97}', nome: '#{ } (Ruby/Pug)' },
  ];
  const valor = sintaxes.map((s) => `${m}${s.sufixo}${s.carga}`).join('');
  const resposta = await enviarEntrada(contexto, alvo, parametro, valor);
  if (resposta === null) return null;
  const avaliada = sintaxes.find((s) => resposta.trechoDoCorpo.includes(`${m}${s.sufixo}8051`));
  if (avaliada === undefined) return null;
  return construirConstatacao({
    tipo: 'INJECAO_DE_TEMPLATE',
    titulo: `Injeção de template no parâmetro ${parametro}`,
    severidade: 'CRITICA',
    local: `parametro:${new URL(alvo.url).pathname}?${parametro}`,
    descricao:
      'A expressão aritmética enviada foi avaliada pelo motor de templates do servidor. Esse tipo de falha costuma evoluir para execução remota de código.',
    requisicao: descreverEntrada(alvo, parametro, `${m}${avaliada.sufixo}${avaliada.carga}`),
    resposta: `HTTP ${resposta.status}\n\n…${trecho(resposta.trechoDoCorpo.slice(Math.max(0, resposta.trechoDoCorpo.indexOf(`${m}${avaliada.sufixo}8051`) - 30), 160), 120)}…`,
    observacao: `A conta 83*97 voltou como 8051 na sintaxe ${avaliada.nome}. Foi usada apenas aritmética.`,
    correcao:
      'Nunca monte templates a partir de entrada do usuário. Passe a entrada como dado (contexto) e, se houver necessidade de templates dinâmicos, use um modo sandbox.',
    owasp: [OWASP.injecao],
  });
}

export async function sondarTravessiaDeCaminho(
  contexto: ContextoAtivo,
  alvo: AlvoDeEntrada,
  parametro: string,
): Promise<Constatacao | null> {
  const valorAtual = alvo.campos[parametro] ?? '';
  if (!PARAMETROS_DE_ARQUIVO.test(parametro) && !/\.[a-z0-9]{2,5}$|\//i.test(valorAtual)) return null;
  const base = await enviarEntrada(contexto, alvo, parametro, valorAtual || 'index');
  for (const carga of CARGAS_DE_TRAVESSIA) {
    const resposta = await enviarEntrada(contexto, alvo, parametro, carga);
    if (resposta === null) continue;
    for (const padrao of PADROES_DE_ARQUIVO_PUBLICO) {
      const achado = padrao.fragmento.exec(resposta.trechoDoCorpo);
      if (achado === null || (base !== null && padrao.regex.test(base.trechoDoCorpo))) continue;
      return construirConstatacao({
        tipo: 'TRAVESSIA_DE_CAMINHO',
        titulo: `Travessia de caminho no parâmetro ${parametro}`,
        severidade: 'ALTA',
        local: `parametro:${new URL(alvo.url).pathname}?${parametro}`,
        descricao:
          'O parâmetro aceita sequências de volta de diretório e a aplicação devolveu o conteúdo de um arquivo do sistema fora do diretório previsto.',
        requisicao: descreverEntrada(alvo, parametro, carga),
        resposta: `HTTP ${resposta.status}\n\n${trecho(achado[0], 40)}`,
        observacao: 'Foi lido apenas um arquivo público e inofensivo do sistema; só o trecho que o identifica foi guardado.',
        correcao:
          'Não use entrada do usuário para montar caminhos. Resolva o caminho e confira que continua dentro do diretório permitido.\n\nconst real = path.resolve(base, nome);\nif (!real.startsWith(base + path.sep)) throw new Error("caminho inválido");',
        owasp: [OWASP.injecao, OWASP.controleDeAcesso],
      });
    }
  }
  return null;
}

export interface OpcoesDeInjecao {
  maximoDeAlvos?: number;
  parametrosPorAlvo?: number;
}

export async function sondarInjecao(
  sessao: SessaoDeTeste,
  paginas: readonly PaginaDescoberta[],
  opcoes: OpcoesDeInjecao = {},
): Promise<Constatacao[]> {
  const contexto = sessao.contexto;
  const constatacoes: Constatacao[] = [];
  const alvos = alvosDeEntrada(paginas, contexto, opcoes.maximoDeAlvos ?? 8);
  for (const alvo of alvos) {
    for (const parametro of parametrosDoAlvo(alvo, opcoes.parametrosPorAlvo ?? 2)) {
      const sql = await sondarInjecaoSql(contexto, alvo, parametro);
      if (sql !== null) constatacoes.push(sql);
      const template = await sondarInjecaoDeTemplate(contexto, alvo, parametro);
      if (template !== null) constatacoes.push(template);
      if (alvo.metodo === 'GET') {
        const travessia = await sondarTravessiaDeCaminho(contexto, alvo, parametro);
        if (travessia !== null) constatacoes.push(travessia);
      }
    }
  }
  return constatacoes;
}

/** As checagens do módulo web repetidas com a sessão (páginas autenticadas). */
export async function repetirChecagensWeb(
  sessao: SessaoDeTeste,
  urlInicial: string,
  paginas: readonly PaginaDescoberta[],
): Promise<Constatacao[]> {
  return [
    ...(await sondarRedirecionamentos(sessao.contexto, urlInicial, paginas)),
    ...(await sondarEntradaRefletida(sessao.contexto, urlInicial, paginas)),
    ...(await sondarErrosDetalhados(sessao.contexto, urlInicial, paginas)),
  ];
}

/** Garante que usuário e senha nunca apareçam em constatações da área autenticada. */
export function protegerConstatacoes(constatacoes: Constatacao[], credencial: CredencialDeTeste): Constatacao[] {
  return constatacoes.map((c) => ocultarNaConstatacao(c, [credencial.usuario, credencial.senha]));
}
