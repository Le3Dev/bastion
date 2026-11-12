/** Minúsculas, sem ponto final e sem porta. */
export const normalizarHost = (host: string): string => {
  let resultado = host.trim().toLowerCase();
  if (resultado.startsWith('[')) {
    const fim = resultado.indexOf(']');
    return fim === -1 ? resultado : resultado.slice(0, fim + 1);
  }
  resultado = resultado.replace(/:\d+$/, '');
  return resultado.replace(/\.+$/, '');
};

/** Verdadeiro se o host é igual ao domínio ou é subdomínio dele. */
export const hostPertenceAoDominio = (host: string, dominio: string): boolean => {
  const h = normalizarHost(host);
  const d = normalizarHost(dominio);
  if (d === '') return false;
  return h === d || h.endsWith(`.${d}`);
};
