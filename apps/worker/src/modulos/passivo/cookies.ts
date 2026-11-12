import {
  conformidade,
  descreverRequisicao,
  listaDeValores,
  type Constatacao,
  type RespostaColetada,
} from './tipos';

export interface CookieInterpretado {
  nome: string;
  atributos: Map<string, string>;
  bruto: string;
}

const NOME_DE_SESSAO = /(sess|sid|token|auth|jwt)/i;

/** Separa vários cookies unidos por vírgula, sem quebrar datas de `Expires`. */
function separarCookies(valor: string): string[] {
  return valor.split(/,(?=\s*[^;,=\s]+=)/).map((parte) => parte.trim()).filter((parte) => parte !== '');
}

export function interpretarSetCookie(bruto: string): CookieInterpretado | null {
  const [primeiro, ...atributosBrutos] = bruto.split(';');
  if (primeiro === undefined) return null;
  const igual = primeiro.indexOf('=');
  if (igual <= 0) return null;
  const nome = primeiro.slice(0, igual).trim();
  if (nome === '') return null;
  const atributos = new Map<string, string>();
  for (const atributo of atributosBrutos) {
    const pedaco = atributo.trim();
    if (pedaco === '') continue;
    const posicao = pedaco.indexOf('=');
    const chave = (posicao === -1 ? pedaco : pedaco.slice(0, posicao)).trim().toLowerCase();
    const valor = posicao === -1 ? '' : pedaco.slice(posicao + 1).trim();
    atributos.set(chave, valor);
  }
  return { nome, atributos, bruto: bruto.trim() };
}

/** Descreve o cookie sem expor o valor (pode ser um segredo de sessão). */
function resumir(cookie: CookieInterpretado): string {
  const atributos = [...cookie.atributos.entries()].map(([chave, valor]) => (valor === '' ? chave : `${chave}=${valor}`));
  return ['set-cookie: ' + cookie.nome + '=<valor omitido>', ...atributos].join('; ');
}

export function analisarCookies(resposta: RespostaColetada): Constatacao[] {
  const constatacoes: Constatacao[] = [];
  const https = resposta.url.toLowerCase().startsWith('https:');
  const requisicao = descreverRequisicao(resposta);

  const cookies = listaDeValores(resposta.cabecalhos['set-cookie'])
    .flatMap(separarCookies)
    .map(interpretarSetCookie)
    .filter((cookie): cookie is CookieInterpretado => cookie !== null);

  for (const cookie of cookies) {
    const sessao = NOME_DE_SESSAO.test(cookie.nome);
    const severidade = sessao ? 'ALTA' : 'MEDIA';
    const evidencia = (observacao: string) => ({
      requisicao,
      resposta: `HTTP ${resposta.status}\n${resumir(cookie)}`,
      observacao,
    });
    const local = `cookie:${cookie.nome}`;

    if (https && !cookie.atributos.has('secure')) {
      constatacoes.push({
        tipo: 'COOKIE_SEM_SECURE',
        titulo: `Cookie "${cookie.nome}" sem o atributo Secure`,
        severidade,
        local,
        descricao:
          'Sem Secure, o navegador pode enviar o cookie em conexões http, expondo-o a interceptação na rede.',
        evidencia: evidencia('O cookie foi definido em uma resposta https sem o atributo Secure.'),
        correcaoSugerida:
          `Marque o cookie como Secure.\n\nnginx:\nproxy_cookie_flags ${cookie.nome} secure;\n\nExpress:\nres.cookie('${cookie.nome}', valor, { secure: true });`,
        conformidade: conformidade(false),
      });
    }

    if (!cookie.atributos.has('httponly')) {
      constatacoes.push({
        tipo: 'COOKIE_SEM_HTTPONLY',
        titulo: `Cookie "${cookie.nome}" sem o atributo HttpOnly`,
        severidade,
        local,
        descricao:
          'Sem HttpOnly, scripts da página conseguem ler o cookie; uma falha de XSS permitiria roubá-lo.',
        evidencia: evidencia('O cookie foi definido sem o atributo HttpOnly.'),
        correcaoSugerida:
          `Marque o cookie como HttpOnly.\n\nnginx:\nproxy_cookie_flags ${cookie.nome} httponly;\n\nExpress:\nres.cookie('${cookie.nome}', valor, { httpOnly: true });`,
        conformidade: conformidade(false),
      });
    }

    if (!cookie.atributos.has('samesite')) {
      constatacoes.push({
        tipo: 'COOKIE_SEM_SAMESITE',
        titulo: `Cookie "${cookie.nome}" sem o atributo SameSite`,
        severidade: 'MEDIA',
        local,
        descricao:
          'Sem SameSite, o cookie pode ser enviado em requisições entre sites, facilitando ataques de CSRF.',
        evidencia: evidencia('O cookie foi definido sem o atributo SameSite.'),
        correcaoSugerida:
          `Defina SameSite=Lax (ou Strict).\n\nnginx:\nproxy_cookie_flags ${cookie.nome} samesite=lax;\n\nExpress:\nres.cookie('${cookie.nome}', valor, { sameSite: 'lax' });`,
        conformidade: conformidade(false),
      });
    }
  }

  return constatacoes;
}
