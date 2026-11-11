"use client";

import { useSyncExternalStore } from "react";
import { assinar, obterEstado, obterEstadoInicial } from "./armazem";
import type { EstadoDoPrototipo } from "./tipos";

/** Retorna o snapshot inteiro (referência estável entre ações). Derive o resto com useMemo ou seletores. */
export const useArmazem = (): EstadoDoPrototipo =>
  useSyncExternalStore(assinar, obterEstado, obterEstadoInicial);
