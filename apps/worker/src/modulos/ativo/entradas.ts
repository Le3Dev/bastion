import type { RespostaHttp } from '../../guardiao-de-escopo/cliente-http';
import { PREFIXO_DE_TESTE, type ContextoAtivo } from './comum';
import type { PaginaDescoberta } from './descoberta';

/** Um ponto de entrada de dados (consulta de uma página ou formulário) que pode receber sondas. */
export interface AlvoDeEntrada {
  url: string;
  metodo: 'GET' | 'POST';
  /** Valores padrão de todos os campos; as sondas trocam um por vez. */
  campos: Record<string, string>;
}

const PARAMETROS_COMUNS = ['q', 'search', 'query', 'name', 'id', 'page', 'file'];

const rotulo = (alvo: AlvoDeEntrada): string => {
  const url = new URL(alvo.url);
  return `${alvo.metodo} ${url.origin}${url.pathname}?${Object.keys(alvo.campos).sort().join('&')}`;
};

/**
 * Extrai alvos das páginas descobertas: parâmetros de consulta existentes e formulários
 * (exceto os de senha, para nunca provocar bloqueio de conta). Formulários POST só entram
 * com consentimento para criação de dados.
 */
export function alvosDeEntrada(
  paginas: readonly PaginaDescoberta[],
  contexto: Pick<ContextoAtivo, 'escopo'>,
  maximo = 12,
): AlvoDeEntrada[] {
  const alvos = new Map<string, AlvoDeEntrada>();
  const adicionar = (alvo: AlvoDeEntrada): void => {
    if (Object.keys(alvo.campos).length === 0) return;
    if (alvo.metodo === 'POST' && !contexto.escopo.permitirCriacaoDeDados) return;
    const chave = rotulo(alvo);
    if (!alvos.has(chave)) alvos.set(chave, alvo);
  };

  for (const pagina of paginas) {
    const url = new URL(pagina.url);
    const campos: Record<string, string> = {};
    for (const [nome, valor] of url.searchParams) campos[nome] = valor;
    // Parâmetros reais vistos em outras URLs do mesmo caminho também são testados.
    for (const nome of pagina.parametros) campos[nome] ??= '1';
    url.search = '';
    adicionar({ url: url.toString(), metodo: 'GET', campos });

    for (const formulario of pagina.formularios) {
      if (formulario.campos.some((campo) => campo.tipo === 'password')) continue;
      const camposDoFormulario: Record<string, string> = {};
      for (const campo of formulario.campos) {
        camposDoFormulario[campo.nome] =
          campo.valor !== '' ? campo.valor : campo.tipo === 'hidden' ? '' : `${PREFIXO_DE_TESTE}1`;
      }
      const acao = new URL(formulario.acao);
      acao.search = '';
      adicionar({ url: acao.toString(), metodo: formulario.metodo, campos: camposDoFormulario });
    }
  }
  return [...alvos.values()].slice(0, maximo);
}

/** Alvo genérico (nomes de parâmetro comuns) para a URL inicial, usado quando nada foi descoberto. */
export function alvoGenerico(urlInicial: string): AlvoDeEntrada {
  const campos: Record<string, string> = {};
  for (const nome of PARAMETROS_COMUNS) campos[nome] = '1';
  return { url: urlInicial, metodo: 'GET', campos };
}

/** Os parâmetros de um alvo que valem a pena sondar (sem campos ocultos/token). */
export const parametrosDoAlvo = (alvo: AlvoDeEntrada, maximo = 4): string[] =>
  Object.keys(alvo.campos).slice(0, maximo);

/** Descrição curta e sem valores sensíveis do pedido de sonda. */
export function descreverEntrada(alvo: AlvoDeEntrada, parametro: string, valor: string): string {
  const url = new URL(alvo.url);
  if (alvo.metodo === 'GET') {
    url.searchParams.set(parametro, valor);
    return `GET ${url.toString()}`;
  }
  return `POST ${url.toString()} (corpo: ${parametro}=${valor})`;
}

/**
 * Envia o alvo com um único parâmetro trocado pelo valor da sonda. Em POST os demais campos
 * (inclusive ocultos/CSRF) seguem como foram descobertos e a sonda recebe o prefixo de teste.
 */
export async function enviarEntrada(
  contexto: ContextoAtivo,
  alvo: AlvoDeEntrada,
  parametro: string,
  valor: string,
): Promise<RespostaHttp | null> {
  if (alvo.metodo === 'GET') {
    const url = new URL(alvo.url);
    for (const [nome, padrao] of Object.entries(alvo.campos)) url.searchParams.set(nome, padrao);
    url.searchParams.set(parametro, valor);
    return contexto.enviar({ url: url.toString() });
  }
  const marcado = valor.startsWith(PREFIXO_DE_TESTE) ? valor : `${PREFIXO_DE_TESTE}${valor}`;
  const corpo = new URLSearchParams({ ...alvo.campos, [parametro]: marcado });
  return contexto.enviar({
    url: alvo.url,
    metodo: 'POST',
    corpo: corpo.toString(),
    cabecalhos: { 'content-type': 'application/x-www-form-urlencoded' },
    intencao: 'CRIACAO',
  });
}
