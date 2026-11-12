export const METODOS_DE_VERIFICACAO = ['DNS_TXT', 'ARQUIVO_WELL_KNOWN', 'CABECALHO_HTTP'] as const;

export type MetodoDeVerificacao = (typeof METODOS_DE_VERIFICACAO)[number];
