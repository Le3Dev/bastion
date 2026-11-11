import type { Membro, Organizacao } from "../tipos";

export const organizacaoInicial: Organizacao = {
  id: "org-1",
  nome: "Organização Exemplo",
  plano: "Profissional",
};

export const membrosIniciais: Membro[] = [
  {
    id: "mem-1",
    nome: "Helena Prado",
    email: "helena.prado@organizacao-exemplo.com.br",
    papel: "DONO",
    estado: "ATIVO",
    desde: "2026-08-03T12:00:00.000Z",
  },
  {
    id: "mem-2",
    nome: "Rafael Costa",
    email: "rafael.costa@organizacao-exemplo.com.br",
    papel: "ADMIN",
    estado: "ATIVO",
    desde: "2026-08-05T14:30:00.000Z",
  },
  {
    id: "mem-3",
    nome: "Marina Alves",
    email: "marina.alves@organizacao-exemplo.com.br",
    papel: "ANALISTA",
    estado: "ATIVO",
    desde: "2026-08-12T10:15:00.000Z",
  },
  {
    id: "mem-4",
    nome: "Diego Martins",
    email: "diego.martins@organizacao-exemplo.com.br",
    papel: "DESENVOLVEDOR",
    estado: "ATIVO",
    desde: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "mem-5",
    nome: "Camila Ribeiro",
    email: "camila.ribeiro@organizacao-exemplo.com.br",
    papel: "LEITOR",
    estado: "CONVIDADO",
    desde: "2026-11-09T17:45:00.000Z",
  },
];
