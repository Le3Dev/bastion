import { ErroDeAplicacao } from '../../compartilhado/erros';

export interface PosicaoDoCursor {
  em: Date;
  id: string;
}

/** Cursor = data e id do último item da página, serializados em base64url. */
export const codificarCursor = (posicao: PosicaoDoCursor): string =>
  Buffer.from(JSON.stringify({ em: posicao.em.toISOString(), id: posicao.id }), 'utf8').toString(
    'base64url',
  );

const FORMATO_DO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const decodificarCursor = (cursor: string): PosicaoDoCursor => {
  const invalido = (): ErroDeAplicacao =>
    new ErroDeAplicacao(400, 'CURSOR_INVALIDO', 'O cursor de paginação é inválido.');
  try {
    const bruto: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof bruto !== 'object' || bruto === null) throw invalido();
    const { em, id } = bruto as { em?: unknown; id?: unknown };
    if (typeof em !== 'string' || typeof id !== 'string' || !FORMATO_DO_ID.test(id)) {
      throw invalido();
    }
    const data = new Date(em);
    if (Number.isNaN(data.getTime())) throw invalido();
    return { em: data, id };
  } catch (erro) {
    throw erro instanceof ErroDeAplicacao ? erro : invalido();
  }
};

/**
 * Corta a página: o repositório busca `limite + 1` itens; se sobrou um, há próxima página
 * e o cursor aponta para o último item devolvido.
 */
export const montarPagina = <T>(
  itensBuscados: readonly T[],
  limite: number,
  posicaoDe: (item: T) => PosicaoDoCursor,
): { itens: T[]; proximaPagina: string | null } => {
  const itens = itensBuscados.slice(0, limite);
  const ultimo = itens[itens.length - 1];
  const temMais = itensBuscados.length > limite && ultimo !== undefined;
  return { itens, proximaPagina: temMais ? codificarCursor(posicaoDe(ultimo)) : null };
};
