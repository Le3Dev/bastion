export const TIPOS_DE_SISTEMA = ['SITE', 'API', 'SISTEMA_INTERNO', 'APP_COM_IA'] as const;

export type TipoDeSistema = (typeof TIPOS_DE_SISTEMA)[number];
