import type { ReactNode } from "react";

export type NomeDeIcone =
  | "painel"
  | "sistemas"
  | "avaliacoes"
  | "achados"
  | "relatorios"
  | "integracoes"
  | "equipe"
  | "plano"
  | "sair"
  | "alerta"
  | "check"
  | "x"
  | "escudo"
  | "relogio"
  | "copiar"
  | "bloqueio";

const tracados: Record<NomeDeIcone, ReactNode> = {
  painel: (
    <>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </>
  ),
  sistemas: (
    <>
      <rect x="3" y="4" width="18" height="12" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  avaliacoes: (
    <>
      <path d="M4 12h4l3-8 4 16 3-8h2" />
    </>
  ),
  achados: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  relatorios: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </>
  ),
  integracoes: (
    <>
      <path d="M9 8L4 12l5 4M15 8l5 4-5 4M13 6l-2 12" />
    </>
  ),
  equipe: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14c2.5 0 4 2 4 5" />
    </>
  ),
  plano: (
    <>
      <rect x="3" y="6" width="18" height="12" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  sair: (
    <>
      <path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  alerta: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16v.5" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  x: <path d="M5 5l14 14M19 5L5 19" />,
  escudo: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  copiar: (
    <>
      <rect x="9" y="9" width="11" height="11" />
      <path d="M5 15V4h11" />
    </>
  ),
  bloqueio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
};

interface PropsDoIcone {
  nome: NomeDeIcone;
  tamanho?: number;
}

export const Icone = ({ nome, tamanho = 18 }: PropsDoIcone) => (
  <svg
    width={tamanho}
    height={tamanho}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden="true"
    focusable="false"
  >
    {tracados[nome]}
  </svg>
);
