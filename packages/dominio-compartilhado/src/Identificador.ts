export type Identificador = string;

export const gerarIdentificador = (): Identificador => globalThis.crypto.randomUUID();
