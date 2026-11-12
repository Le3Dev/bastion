import { gerarIdentificador, type Identificador } from './Identificador';

export interface EventoDeDominio<TTipo extends string = string, TDados = unknown> {
  readonly id: Identificador;
  readonly tipo: TTipo;
  readonly organizacaoId: Identificador;
  readonly ocorridoEm: Date;
  readonly dados: TDados;
}

export const criarEvento = <TTipo extends string, TDados>(
  tipo: TTipo,
  organizacaoId: Identificador,
  dados: TDados,
  ocorridoEm: Date,
): EventoDeDominio<TTipo, TDados> => ({
  id: gerarIdentificador(),
  tipo,
  organizacaoId,
  ocorridoEm,
  dados,
});
