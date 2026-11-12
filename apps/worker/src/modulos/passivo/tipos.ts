import type { Constatacao, TipoDeConstatacao } from '@bastion/contratos';

/** Resposta HTTP já coletada; nomes de cabeçalhos em minúsculas. */
export interface RespostaColetada {
  url: string;
  metodo: string;
  status: number;
  cabecalhos: Record<string, string | string[]>;
}

export interface CertificadoColetado {
  validoDe: Date;
  validoAte: Date;
  emissor: string;
  sujeito: string;
  confiavel: boolean;
  nomeConfere: boolean;
  motivoDaDesconfianca: string | null;
}

export interface DadosDoTls {
  host: string;
  protocolosAceitos: string[];
  certificado: CertificadoColetado | null;
}

export const OWASP_CONFIGURACAO_INCORRETA = 'A02:2025 Configuração Incorreta de Segurança';
export const OWASP_FALHAS_CRIPTOGRAFICAS = 'A04:2025 Falhas Criptográficas';
export const LGPD_MEDIDAS_DE_SEGURANCA = 'Art. 46: medidas de segurança';

export function conformidade(criptografia: boolean): Constatacao['conformidade'] {
  return {
    owasp: [criptografia ? OWASP_FALHAS_CRIPTOGRAFICAS : OWASP_CONFIGURACAO_INCORRETA],
    lgpd: [LGPD_MEDIDAS_DE_SEGURANCA],
  };
}

export type { Constatacao, TipoDeConstatacao };

export function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function listaDeValores(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

export function descreverRequisicao(resposta: RespostaColetada): string {
  return `${resposta.metodo.toUpperCase()} ${resposta.url}`;
}

/** Linha de status e apenas os cabeçalhos pedidos (os que existem na resposta). */
export function descreverResposta(resposta: RespostaColetada, relevantes: readonly string[]): string {
  const linhas = [`HTTP ${resposta.status}`];
  for (const nome of relevantes) {
    for (const valor of listaDeValores(resposta.cabecalhos[nome])) {
      linhas.push(`${nome}: ${valor}`);
    }
  }
  return linhas.join('\n');
}
