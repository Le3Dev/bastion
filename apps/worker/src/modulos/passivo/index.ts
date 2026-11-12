import { analisarCabecalhos } from './cabecalhos';
import { analisarCookies } from './cookies';
import type { Constatacao, RespostaColetada } from './tipos';
import { analisarExposicaoDeVersao } from './versao';

export { analisarCabecalhos } from './cabecalhos';
export { analisarCookies } from './cookies';
export { analisarExposicaoDeVersao } from './versao';
export { analisarTls } from './tls';
export type { CertificadoColetado, DadosDoTls, RespostaColetada } from './tipos';

export function analisarRespostaPassiva(resposta: RespostaColetada): Constatacao[] {
  return [
    ...analisarCabecalhos(resposta),
    ...analisarCookies(resposta),
    ...analisarExposicaoDeVersao(resposta),
  ];
}
