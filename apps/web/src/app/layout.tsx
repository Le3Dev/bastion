import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bastion",
  description: "Plataforma de avaliação de segurança contínua (protótipo navegável).",
};

const LayoutRaiz = ({ children }: { children: ReactNode }) => (
  <html lang="pt-BR">
    <body>{children}</body>
  </html>
);

export default LayoutRaiz;
