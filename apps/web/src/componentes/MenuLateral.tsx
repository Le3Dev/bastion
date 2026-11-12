"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSessao } from "@/api/sessao";
import { rotuloDoPapel } from "@/apresentacao/rotulos";
import { Icone, type NomeDeIcone } from "./Icone";

interface ItemDoMenu {
  rotulo: string;
  href: string;
  prefixo: string;
  icone: NomeDeIcone;
}

export const MenuLateral = () => {
  const { usuario, organizacao, papel, sair } = useSessao();
  const caminho = usePathname();
  const [saindo, setSaindo] = useState(false);

  const itens: ItemDoMenu[] = [
    { rotulo: "Painel", href: "/painel", prefixo: "/painel", icone: "painel" },
    { rotulo: "Sistemas", href: "/sistemas", prefixo: "/sistemas", icone: "sistemas" },
    { rotulo: "Avaliações", href: "/avaliacoes", prefixo: "/avaliacoes", icone: "avaliacoes" },
    { rotulo: "Achados", href: "/achados", prefixo: "/achados", icone: "achados" },
    { rotulo: "Relatórios", href: "/relatorios", prefixo: "/relatorios", icone: "relatorios" },
    { rotulo: "Integrações", href: "/integracoes", prefixo: "/integracoes", icone: "integracoes" },
    { rotulo: "Equipe e auditoria", href: "/equipe", prefixo: "/equipe", icone: "equipe" },
    { rotulo: "Plano e cobrança", href: "/plano", prefixo: "/plano", icone: "plano" },
  ];

  const aoSair = (): void => {
    setSaindo(true);
    void sair();
  };

  return (
    <aside className="menu-lateral">
      <div className="marca">BASTION</div>
      <nav aria-label="Navegação principal" className="pilha">
        {itens.map((item) => {
          const ativo = caminho === item.prefixo || caminho.startsWith(`${item.prefixo}/`);
          return (
            <Link
              key={item.prefixo}
              href={item.href}
              className={ativo ? "menu-item menu-item-ativo" : "menu-item"}
              aria-current={ativo ? "page" : undefined}
            >
              <Icone nome={item.icone} />
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
      <div className="menu-rodape pilha">
        <div>
          <div className="texto-2">{organizacao.nome}</div>
          <div>{usuario.nome}</div>
          <div className="texto-muted mono">{rotuloDoPapel(papel)}</div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={aoSair} disabled={saindo}>
          <Icone nome="sair" tamanho={16} />
          Sair
        </button>
      </div>
    </aside>
  );
};
