import type { ReactNode } from "react";
import { MenuLateral } from "@/componentes/MenuLateral";

const LayoutDaPlataforma = ({ children }: { children: ReactNode }) => (
  <div className="app">
    <MenuLateral />
    <main className="conteudo">{children}</main>
  </div>
);

export default LayoutDaPlataforma;
