import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token opaco de sessão: 32 bytes aleatórios em base64url. */
export const gerarTokenOpaco = (): string => randomBytes(32).toString('base64url');

export const hashSha256 = (valor: string): string =>
  createHash('sha256').update(valor).digest('hex');

/** Compara dois hashes hexadecimais em tempo constante. */
export const hashesIguais = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
};

export interface ChaveDeApiGerada {
  /** Valor completo, exibido uma única vez: `bst_<prefixo8>_<segredo>`. */
  valorCompleto: string;
  /** `bst_<prefixo8>`: identifica a chave sem revelar o segredo. */
  prefixo: string;
  hashDoSegredo: string;
}

export const gerarChaveDeApi = (): ChaveDeApiGerada => {
  const identificador = randomBytes(4).toString('hex');
  const segredo = randomBytes(32).toString('base64url');
  const valorCompleto = `bst_${identificador}_${segredo}`;
  return {
    valorCompleto,
    prefixo: `bst_${identificador}`,
    hashDoSegredo: hashSha256(valorCompleto),
  };
};

const FORMATO_DA_CHAVE = /^(bst_[0-9a-f]{8})_(.+)$/;

/** Extrai o prefixo de uma chave `bst_...`; devolve `null` se o formato não for o esperado. */
export const separarChaveDeApi = (valor: string): { prefixo: string; hash: string } | null => {
  const correspondencia = FORMATO_DA_CHAVE.exec(valor);
  if (!correspondencia || correspondencia[1] === undefined) return null;
  return { prefixo: correspondencia[1], hash: hashSha256(valor) };
};

/** Token de verificação de propriedade: 32 caracteres hexadecimais. */
export const gerarTokenDeVerificacao = (): string => randomBytes(16).toString('hex');

export const gerarSegredoDeWebhook = (): string =>
  `whsec_${randomBytes(32).toString('base64url')}`;

const FORMATO_DO_CONVITE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(.+)$/i;

/** O token do convite carrega o id da organização (necessário para o RLS) e um segredo aleatório. */
export const gerarTokenDeConvite = (organizacaoId: string): string =>
  `${organizacaoId}.${randomBytes(24).toString('base64url')}`;

export const separarTokenDeConvite = (
  token: string,
): { organizacaoId: string; hash: string } | null => {
  const correspondencia = FORMATO_DO_CONVITE.exec(token.trim());
  if (!correspondencia || correspondencia[1] === undefined) return null;
  return { organizacaoId: correspondencia[1].toLowerCase(), hash: hashSha256(token.trim()) };
};
