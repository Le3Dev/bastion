import type { ReactNode } from "react";

export type TipoDeAlerta = "info" | "success" | "warning" | "error";

interface PropsDoAlerta {
  tipo: TipoDeAlerta;
  children: ReactNode;
}

export const Alerta = ({ tipo, children }: PropsDoAlerta) => (
  <div className={`alert alert-${tipo}`} role={tipo === "error" ? "alert" : "status"}>
    {children}
  </div>
);
