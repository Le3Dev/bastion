import { ErroDeRequisicao, RequisicaoBloqueada, type ClienteHttp } from './cliente-http';

/** Um freio (teto de requisições ou disjuntor) interrompeu a avaliação inteira. */
export class ErroDeFreio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeFreio';
  }
}

export const MOTIVO_TETO_ATINGIDO = 'Teto de requisições atingido.';
export const MOTIVO_ALVO_INSTAVEL = 'Alvo instável (muitos erros); avaliação interrompida.';

/**
 * Disjuntor: abre quando o alvo responde 5xx ou 429 (ou deixa de responder) em sequência.
 * Qualquer resposta saudável zera a contagem.
 */
export class CircuitoDeFalhas {
  private seguidas = 0;
  private abertoAgora = false;

  constructor(private readonly limite = 10) {
    if (!(limite >= 1)) throw new RangeError('limite deve ser pelo menos 1');
  }

  registrarStatus(status: number): void {
    if (status >= 500 || status === 429) this.falhou();
    else this.seguidas = 0;
  }

  registrarFalhaDeRede(): void {
    this.falhou();
  }

  get aberto(): boolean {
    return this.abertoAgora;
  }

  private falhou(): void {
    this.seguidas += 1;
    if (this.seguidas >= this.limite) this.abertoAgora = true;
  }
}

export interface OpcoesDeFreios {
  tetoDeRequisicoes: number;
  circuito: CircuitoDeFalhas;
  /** Chamado antes de cada requisição (ex.: conferir cancelamento e tempo máximo); pode lançar. */
  antes?: () => Promise<void>;
}

export interface ClienteComFreios extends Pick<ClienteHttp, 'requisitar'> {
  /** Requisições tentadas até agora (inclui as barradas pelo Guardião). */
  readonly requisicoes: () => number;
}

/**
 * Envolve o cliente do Guardião com o teto de requisições e o disjuntor.
 * Estourar qualquer um lança `ErroDeFreio`, que os módulos nunca engolem.
 */
export function aplicarFreios(cliente: Pick<ClienteHttp, 'requisitar'>, opcoes: OpcoesDeFreios): ClienteComFreios {
  let contador = 0;
  return {
    requisicoes: () => contador,
    requisitar: async (pedido) => {
      await opcoes.antes?.();
      if (opcoes.circuito.aberto) throw new ErroDeFreio(MOTIVO_ALVO_INSTAVEL);
      if (contador >= opcoes.tetoDeRequisicoes) throw new ErroDeFreio(MOTIVO_TETO_ATINGIDO);
      contador += 1;
      try {
        const resposta = await cliente.requisitar(pedido);
        opcoes.circuito.registrarStatus(resposta.status);
        if (opcoes.circuito.aberto) throw new ErroDeFreio(MOTIVO_ALVO_INSTAVEL);
        return resposta;
      } catch (erro) {
        if (erro instanceof ErroDeRequisicao) {
          opcoes.circuito.registrarFalhaDeRede();
          if (opcoes.circuito.aberto) throw new ErroDeFreio(MOTIVO_ALVO_INSTAVEL);
        }
        if (erro instanceof RequisicaoBloqueada) contador -= 1;
        throw erro;
      }
    },
  };
}
