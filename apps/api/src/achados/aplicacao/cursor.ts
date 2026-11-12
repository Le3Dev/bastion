import { ErroDeAplicacao } from '../../compartilhado/erros';
import {
  POSTO_DA_SEVERIDADE,
  type PosicaoDoCursorDeAchados,
  type ResumoDeAchado,
} from '../infraestrutura/RepositorioDeAchados';

const FORMATO_DO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor opaco: severidade, última vez e id do último item, em base64url. */
export const codificarCursorDeAchados = (posicao: PosicaoDoCursorDeAchados): string =>
  Buffer.from(
    JSON.stringify({ p: posicao.posto, em: posicao.ultimaVezEm.toISOString(), id: posicao.id }),
    'utf8',
  ).toString('base64url');

export const decodificarCursorDeAchados = (cursor: string): PosicaoDoCursorDeAchados => {
  const invalido = (): ErroDeAplicacao =>
    new ErroDeAplicacao(400, 'CURSOR_INVALIDO', 'O cursor de paginação é inválido.');
  try {
    const bruto: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof bruto !== 'object' || bruto === null) throw invalido();
    const { p, em, id } = bruto as { p?: unknown; em?: unknown; id?: unknown };
    if (
      typeof p !== 'number' ||
      !Number.isInteger(p) ||
      p < 0 ||
      p > 3 ||
      typeof em !== 'string' ||
      typeof id !== 'string' ||
      !FORMATO_DO_ID.test(id)
    ) {
      throw invalido();
    }
    const data = new Date(em);
    if (Number.isNaN(data.getTime())) throw invalido();
    return { posto: p, ultimaVezEm: data, id };
  } catch (erro) {
    throw erro instanceof ErroDeAplicacao ? erro : invalido();
  }
};

/** O repositório busca `limite + 1` itens; se sobrou um, há próxima página. */
export const montarPaginaDeAchados = (
  itensBuscados: readonly ResumoDeAchado[],
  limite: number,
): { itens: ResumoDeAchado[]; proximaPagina: string | null } => {
  const itens = itensBuscados.slice(0, limite);
  const ultimo = itens[itens.length - 1];
  const temMais = itensBuscados.length > limite && ultimo !== undefined;
  return {
    itens,
    proximaPagina: temMais
      ? codificarCursorDeAchados({
          posto: POSTO_DA_SEVERIDADE[ultimo.severidade],
          ultimaVezEm: ultimo.ultimaVezEm,
          id: ultimo.id,
        })
      : null,
  };
};
