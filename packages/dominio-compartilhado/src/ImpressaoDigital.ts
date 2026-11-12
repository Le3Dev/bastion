export class ImpressaoDigital {
  readonly valor: string;

  private constructor(valor: string) {
    this.valor = valor;
  }

  static de(sistemaId: string, tipo: string, local: string): ImpressaoDigital {
    const localNormalizado = local.trim().toLowerCase().replace(/\/+$/, '');
    return new ImpressaoDigital(`${sistemaId}:${tipo}:${localNormalizado}`);
  }

  static reconstituir(valor: string): ImpressaoDigital {
    return new ImpressaoDigital(valor);
  }

  igualA(outra: ImpressaoDigital): boolean {
    return this.valor === outra.valor;
  }
}
