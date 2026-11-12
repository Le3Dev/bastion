const FUSO = "America/Sao_Paulo";

const formatadorDeData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatadorDeDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatadorDeHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const formatadorDeMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarData = (iso: string): string => formatadorDeData.format(new Date(iso));

export const formatarDataHora = (iso: string): string => formatadorDeDataHora.format(new Date(iso));

export const formatarHora = (iso: string): string => formatadorDeHora.format(new Date(iso));

export const formatarMoeda = (valor: number): string => formatadorDeMoeda.format(valor);

/** Só usar em client após a montagem (depende do relógio atual). */
export const formatarRelativo = (iso: string, agora: number): string => {
  const minutos = Math.round((agora - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.round(horas / 24)} d`;
};
