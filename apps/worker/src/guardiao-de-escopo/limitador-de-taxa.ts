interface Balde {
  fichas: number;
  atualizadoEm: number;
}

/**
 * Token bucket por host. `reservar` consome uma ficha (mesmo que precise esperar)
 * e devolve quantos milissegundos o chamador deve aguardar antes de requisitar.
 */
export class LimitadorDeTaxa {
  private baldes = new Map<string, Balde>();

  constructor(
    private readonly requisicoesPorSegundo: number,
    private readonly relogio: () => number = Date.now,
  ) {
    if (!(requisicoesPorSegundo > 0)) {
      throw new RangeError('requisicoesPorSegundo deve ser maior que zero');
    }
  }

  reservar(host: string): number {
    const agora = this.relogio();
    const balde = this.baldes.get(host) ?? { fichas: this.requisicoesPorSegundo, atualizadoEm: agora };
    const decorrido = Math.max(0, agora - balde.atualizadoEm);
    balde.fichas = Math.min(
      this.requisicoesPorSegundo,
      balde.fichas + (decorrido / 1000) * this.requisicoesPorSegundo,
    );
    balde.atualizadoEm = agora;
    balde.fichas -= 1;
    this.baldes.set(host, balde);
    if (balde.fichas >= 0) return 0;
    return Math.ceil((-balde.fichas / this.requisicoesPorSegundo) * 1000);
  }
}
