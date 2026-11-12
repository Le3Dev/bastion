export interface DadosDaEvidencia {
  readonly requisicao: string;
  readonly resposta: string;
  readonly observacao: string;
}

export const LIMITE_DA_EVIDENCIA_EM_BYTES = 8 * 1024;
export const MARCA_DE_TRUNCAMENTO = '[truncado]';

const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8');

const truncar = (texto: string): string => {
  const bytes = codificador.encode(texto);
  if (bytes.length <= LIMITE_DA_EVIDENCIA_EM_BYTES) return texto;
  const corte = decodificador
    .decode(bytes.subarray(0, LIMITE_DA_EVIDENCIA_EM_BYTES))
    .replace(/�+$/u, '');
  return `${corte} ${MARCA_DE_TRUNCAMENTO}`;
};

/** Evidência pequena (até 8 KB por campo) guardada inline no achado. */
export class Evidencia {
  readonly requisicao: string;
  readonly resposta: string;
  readonly observacao: string;

  private constructor(dados: DadosDaEvidencia) {
    this.requisicao = dados.requisicao;
    this.resposta = dados.resposta;
    this.observacao = dados.observacao;
  }

  static criar(dados: DadosDaEvidencia): Evidencia {
    return new Evidencia({
      requisicao: truncar(dados.requisicao),
      resposta: truncar(dados.resposta),
      observacao: truncar(dados.observacao),
    });
  }

  static reconstituir(dados: DadosDaEvidencia): Evidencia {
    return new Evidencia(dados);
  }

  paraDados(): DadosDaEvidencia {
    return { requisicao: this.requisicao, resposta: this.resposta, observacao: this.observacao };
  }
}
