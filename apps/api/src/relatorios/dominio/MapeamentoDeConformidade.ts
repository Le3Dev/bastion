export interface ContagemDeCodigo {
  readonly codigo: string;
  readonly quantidade: number;
}

export interface AchadoParaConformidade {
  readonly conformidade: {
    readonly owasp: readonly string[];
    readonly lgpd: readonly string[];
  };
}

const contar = (listas: readonly (readonly string[])[]): ContagemDeCodigo[] => {
  const contagem = new Map<string, number>();
  for (const lista of listas) {
    for (const codigo of new Set(lista)) {
      contagem.set(codigo, (contagem.get(codigo) ?? 0) + 1);
    }
  }
  return [...contagem.entries()]
    .map(([codigo, quantidade]) => ({ codigo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.codigo.localeCompare(b.codigo));
};

/** Quantos achados tocam cada código OWASP e LGPD, do mais frequente ao menos. */
export class MapeamentoDeConformidade {
  readonly owasp: readonly ContagemDeCodigo[];
  readonly lgpd: readonly ContagemDeCodigo[];

  private constructor(owasp: readonly ContagemDeCodigo[], lgpd: readonly ContagemDeCodigo[]) {
    this.owasp = owasp;
    this.lgpd = lgpd;
  }

  static agregar(achados: readonly AchadoParaConformidade[]): MapeamentoDeConformidade {
    return new MapeamentoDeConformidade(
      contar(achados.map((achado) => achado.conformidade.owasp)),
      contar(achados.map((achado) => achado.conformidade.lgpd)),
    );
  }

  static reconstituir(dados: {
    readonly owasp: readonly ContagemDeCodigo[];
    readonly lgpd: readonly ContagemDeCodigo[];
  }): MapeamentoDeConformidade {
    return new MapeamentoDeConformidade(dados.owasp, dados.lgpd);
  }

  paraDados(): { owasp: ContagemDeCodigo[]; lgpd: ContagemDeCodigo[] } {
    return { owasp: [...this.owasp], lgpd: [...this.lgpd] };
  }
}
