import { ErroDeDominio } from '@bastion/dominio-compartilhado';

export interface DadosDoConectorDeIa {
  readonly url: string;
  /** JSON com o marcador {{mensagem}}. */
  readonly modeloDoCorpo: string;
  /** Caminho da resposta, p. ex. `resposta.texto`. */
  readonly caminhoDaResposta: string;
  readonly frasesSigilosas: readonly string[];
  /** Cabeçalhos (p. ex. autorização) já cifrados; opaco para o domínio. */
  readonly cabecalhosCifrados: string | null;
}

/** Objeto de valor imutável: como o Bastion conversa com o app de IA do cliente. */
export class ConectorDeIa {
  private constructor(private readonly dados: DadosDoConectorDeIa) {
    Object.freeze(this);
  }

  static criar(dados: DadosDoConectorDeIa): ConectorDeIa {
    if (dados.url.trim() === '' || dados.modeloDoCorpo.trim() === '' || dados.caminhoDaResposta.trim() === '') {
      throw new ErroDeDominio(
        'URL, modelo do corpo e caminho da resposta do conector de IA são obrigatórios.',
        'CONECTOR_INCOMPLETO',
      );
    }
    if (!dados.modeloDoCorpo.includes('{{mensagem}}')) {
      throw new ErroDeDominio(
        'O modelo do corpo deve conter o marcador {{mensagem}}.',
        'CONECTOR_SEM_MARCADOR',
      );
    }
    return ConectorDeIa.reconstituir(dados);
  }

  static reconstituir(dados: DadosDoConectorDeIa): ConectorDeIa {
    return new ConectorDeIa({ ...dados, frasesSigilosas: [...dados.frasesSigilosas] });
  }

  get url(): string {
    return this.dados.url;
  }

  get modeloDoCorpo(): string {
    return this.dados.modeloDoCorpo;
  }

  get caminhoDaResposta(): string {
    return this.dados.caminhoDaResposta;
  }

  get frasesSigilosas(): readonly string[] {
    return this.dados.frasesSigilosas;
  }

  get cabecalhosCifrados(): string | null {
    return this.dados.cabecalhosCifrados;
  }

  paraDados(): DadosDoConectorDeIa {
    return { ...this.dados, frasesSigilosas: [...this.dados.frasesSigilosas] };
  }
}
