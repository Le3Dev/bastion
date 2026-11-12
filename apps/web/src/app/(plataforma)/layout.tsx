import type { ReactNode } from "react";
import { SessaoProvider } from "@/api/sessao";
import { MenuLateral } from "@/componentes/MenuLateral";

const LayoutDaPlataforma = ({ children }: { children: ReactNode }) => (
  <SessaoProvider>
    <div className="app">
      <MenuLateral />
      <main className="conteudo">{children}</main>
    </div>
  </SessaoProvider>
);

export default LayoutDaPlataforma;
