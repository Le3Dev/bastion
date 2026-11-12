import type { Severidade } from '@bastion/dominio-compartilhado';
import type { DadosDaEvidencia } from './Evidencia';

/** Constatação bruta vinda da análise; espelha o contrato publicado sem depender dele. */
export interface DadosDaConstatacao {
  readonly tipo: string;
  readonly titulo: string;
  readonly severidade: Severidade;
  readonly local: string;
  readonly descricao: string;
  readonly evidencia: DadosDaEvidencia;
  readonly correcaoSugerida: string;
  readonly conformidade: {
    readonly owasp: readonly string[];
    readonly lgpd: readonly string[];
  };
}
