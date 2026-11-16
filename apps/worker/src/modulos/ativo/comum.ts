import type { Constatacao, EscopoDaTarefa, PerfilDeAvaliacao } from '@bastion/contratos';
import {
  ErroDeRequisicao,
  RequisicaoBloqueada,
  type ClienteHttp,
  type DecisaoRegistrada,
  type RespostaHttp,
} from '../../guardiao-de-escopo/cliente-http';
import { ErroDeFreio } from '../../guardiao-de-escopo/freios';
import type { LimitadorDeTaxa } from '../../guardiao-de-escopo/limitador-de-taxa';
import { LGPD_MEDIDAS_DE_SEGURANCA } from '../passivo/tipos';

/** Métodos que só leem: liberados por padrão, desde que o escopo os autorize. */
export const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Prefixo que marca todo valor criado pela plataforma no sistema avaliado. */
export const PREFIXO_DE_TESTE = 'bastion-teste-';

/**
 * Por que o pedido é feito. Métodos que escrevem só saem como `CRIACAO` e, assim, só com
 * consentimento; `AUTENTICACAO` (login de teste) e `CONVERSA` (conector de IA) são
 * autorizados pela própria configuração do cliente.
 */
export type Intencao = 'LEITURA' | 'CRIACAO' | 'AUTENTICACAO' | 'CONVERSA';

export interface PedidoDoModulo {
  url: string;
  metodo?: string;
  cabecalhos?: Record<string, string>;
  corpo?: string;
  intencao?: Intencao;
  naoSeguirRedirecionamentos?: boolean;
  limitador?: LimitadorDeTaxa;
}

/** Tudo o que um módulo ativo precisa para falar com o alvo, sempre pelo Guardião. */
export interface ContextoAtivo {
  escopo: EscopoDaTarefa;
  perfil: PerfilDeAvaliacao;
  /** Lança `RequisicaoBloqueada`, `ErroDeRequisicao` ou `ErroDeFreio`. */
  requisitar(pedido: PedidoDoModulo): Promise<RespostaHttp>;
  /** Como `requisitar`, mas devolve `null` quando o pedido não pôde ser feito (só `ErroDeFreio` sobe). */
  enviar(pedido: PedidoDoModulo): Promise<RespostaHttp | null>;
}

export interface BaseDoContexto {
  clienteHttp: Pick<ClienteHttp, 'requisitar'>;
  perfil: PerfilDeAvaliacao;
  escopo: EscopoDaTarefa;
  limitador?: LimitadorDeTaxa;
  aoDecidir?: (decisao: DecisaoRegistrada) => void;
}

export function montarContexto(
  base: Pick<BaseDoContexto, 'perfil' | 'escopo'>,
  requisitar: ContextoAtivo['requisitar'],
): ContextoAtivo {
  return {
    escopo: base.escopo,
    perfil: base.perfil,
    requisitar,
    enviar: (pedido) => tentar(() => requisitar(pedido)),
  };
}

export function criarContexto(base: BaseDoContexto): ContextoAtivo {
  const requisitar: ContextoAtivo['requisitar'] = async (pedido) => {
    const metodo = (pedido.metodo ?? 'GET').toUpperCase();
    const intencao = pedido.intencao ?? 'LEITURA';
    if (!METODOS_DE_LEITURA.has(metodo)) {
      if (intencao === 'LEITURA') {
        throw new RequisicaoBloqueada(`Método ${metodo} não é de leitura e não foi declarado como ação autorizada`);
      }
      if (intencao === 'CRIACAO' && !base.escopo.permitirCriacaoDeDados) {
        throw new RequisicaoBloqueada('Criação de dados não foi autorizada neste escopo');
      }
    }
    const limitador = pedido.limitador ?? base.limitador;
    return base.clienteHttp.requisitar({
      url: pedido.url,
      metodo,
      perfil: base.perfil,
      escopo: base.escopo,
      ...(pedido.cabecalhos ? { cabecalhos: pedido.cabecalhos } : {}),
      ...(pedido.corpo !== undefined ? { corpo: pedido.corpo } : {}),
      ...(limitador ? { limitador } : {}),
      ...(base.aoDecidir ? { aoDecidir: base.aoDecidir } : {}),
      ...(pedido.naoSeguirRedirecionamentos ? { naoSeguirRedirecionamentos: true } : {}),
    });
  };
  return montarContexto(base, requisitar);
}

/** Executa a ação; bloqueios do Guardião e falhas de rede viram `null`, freios continuam subindo. */
export async function tentar<T>(acao: () => Promise<T>): Promise<T | null> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof ErroDeFreio) throw erro;
    if (erro instanceof RequisicaoBloqueada || erro instanceof ErroDeRequisicao) return null;
    throw erro;
  }
}

export const cabecalho = (resposta: RespostaHttp, nome: string): string | undefined => {
  const valor = resposta.cabecalhos[nome.toLowerCase()];
  return Array.isArray(valor) ? valor[0] : valor;
};

export const ehHtml = (resposta: RespostaHttp): boolean => {
  const tipo = cabecalho(resposta, 'content-type');
  return tipo === undefined || /html/i.test(tipo);
};

export function trecho(texto: string, maximo = 300): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length > maximo ? `${limpo.slice(0, maximo)}…` : limpo;
}

/** Linha de status, cabeçalhos pedidos e um trecho curto do corpo (nunca cookies). */
export function resumirResposta(resposta: RespostaHttp, cabecalhos: readonly string[] = [], corpo = 200): string {
  const linhas = [`HTTP ${resposta.status}`];
  for (const nome of cabecalhos) {
    const valor = cabecalho(resposta, nome);
    if (valor !== undefined) linhas.push(`${nome}: ${valor}`);
  }
  const amostra = trecho(resposta.trechoDoCorpo, corpo);
  if (amostra !== '' && corpo > 0) linhas.push('', amostra);
  return linhas.join('\n');
}

export function comParametro(url: string, nome: string, valor: string): string {
  const alvo = new URL(url);
  alvo.searchParams.set(nome, valor);
  return alvo.toString();
}

export const origemDe = (url: string): string => new URL(url).origin;

export const OWASP = {
  controleDeAcesso: 'A01:2025 Controle de Acesso Quebrado',
  configuracao: 'A02:2025 Configuração Incorreta de Segurança',
  injecao: 'A05:2025 Injeção',
  ssrf: 'A10:2025 Falsificação de Requisição do Lado do Servidor (SSRF)',
  autenticacao: 'A07:2025 Falhas de Autenticação',
  projetoInseguro: 'A06:2025 Design Inseguro',
  llmInjecaoDePrompt: 'LLM01:2025 Injeção de Prompt',
  llmDadosSensiveis: 'LLM02:2025 Divulgação de Informações Sensíveis',
  llmSaida: 'LLM05:2025 Tratamento Inadequado de Saída',
  llmAgencia: 'LLM06:2025 Agência Excessiva',
  llmPromptDeSistema: 'LLM07:2025 Vazamento do Prompt de Sistema',
} as const;

export function conformidadeDe(...owasp: string[]): Constatacao['conformidade'] {
  return { owasp, lgpd: [LGPD_MEDIDAS_DE_SEGURANCA] };
}

export interface DadosDaConstatacao {
  tipo: Constatacao['tipo'];
  titulo: string;
  severidade: Constatacao['severidade'];
  local: string;
  descricao: string;
  requisicao: string;
  resposta: string;
  observacao: string;
  correcao: string;
  owasp: string[];
}

export function construirConstatacao(dados: DadosDaConstatacao): Constatacao {
  return {
    tipo: dados.tipo,
    titulo: dados.titulo,
    severidade: dados.severidade,
    local: dados.local,
    descricao: dados.descricao,
    evidencia: { requisicao: dados.requisicao, resposta: dados.resposta, observacao: dados.observacao },
    correcaoSugerida: dados.correcao,
    conformidade: conformidadeDe(...dados.owasp),
  };
}

export const descreverPedido = (metodo: string, url: string): string => `${metodo.toUpperCase()} ${url}`;

/** Troca cada segredo (usuário, senha, frases sigilosas) por um marcador, em qualquer texto. */
export function ocultarSegredos(texto: string, segredos: readonly string[]): string {
  let saida = texto;
  for (const segredo of segredos) {
    if (segredo.length >= 3) saida = saida.split(segredo).join('[oculto]');
  }
  return saida;
}

export function ocultarNaConstatacao(constatacao: Constatacao, segredos: readonly string[]): Constatacao {
  const o = (texto: string): string => ocultarSegredos(texto, segredos);
  return {
    ...constatacao,
    titulo: o(constatacao.titulo),
    local: o(constatacao.local),
    descricao: o(constatacao.descricao),
    evidencia: {
      requisicao: o(constatacao.evidencia.requisicao),
      resposta: o(constatacao.evidencia.resposta),
      observacao: o(constatacao.evidencia.observacao),
    },
    correcaoSugerida: o(constatacao.correcaoSugerida),
  };
}

/** Marcador curto, único por execução, para sondas que precisam ser reconhecidas na resposta. */
export function novoMarcador(prefixo = 'bstn'): string {
  const aleatorio = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${prefixo}${aleatorio}`;
}
