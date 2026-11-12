"use client";

import { obterPlano } from "@/api/contas";
import { useSessao } from "@/api/sessao";
import { useConsulta } from "@/api/useConsulta";
import { Alerta } from "@/componentes/Alerta";
import { BarraDeProgresso } from "@/componentes/BarraDeProgresso";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";

const LIMITE_DE_ALERTA = 80;

const percentual = (uso: number, limite: number): number => (limite > 0 ? Math.round((uso / limite) * 100) : 0);

const PaginaDoPlano = () => {
  const { organizacao } = useSessao();
  const { dados: plano, erro, carregando } = useConsulta(obterPlano);

  const consumos = plano
    ? [
        { chave: "sistemas", rotulo: "Sistemas", uso: plano.uso.sistemas, limite: plano.limites.sistemas },
        {
          chave: "avaliacoes",
          rotulo: "Avaliações no mês",
          uso: plano.uso.avaliacoesNoMes,
          limite: plano.limites.avaliacoesPorMes,
        },
        { chave: "membros", rotulo: "Membros", uso: plano.uso.membros, limite: plano.limites.membros },
      ].map((c) => ({ ...c, pct: percentual(c.uso, c.limite) }))
    : [];

  const proximosDoLimite = consumos.filter((c) => c.pct > LIMITE_DE_ALERTA);

  return (
    <div className="page pilha">
      <CabecalhoDaPagina
        titulo="Plano e cobrança"
        descricao="Consumo da organização em relação aos limites do plano."
        acoes={
          <button type="button" className="btn btn-outline" disabled>
            Alterar plano
          </button>
        }
      />

      <Alerta tipo="info">Cobrança real fora do MVP: não há faturas nem pagamento nesta versão.</Alerta>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}

      {carregando && !plano ? <p className="texto-2">Carregando plano...</p> : null}

      {plano ? (
        <>
          <div className="card kpi">
            <span className="kpi-rotulo">Plano atual</span>
            <span className="kpi-valor">{plano.nome}</span>
            <span className="texto-2">{organizacao.nome}</span>
          </div>

          <div className="card pilha">
            <h2 className="card-titulo">Uso e limites</h2>
            {proximosDoLimite.length > 0 ? (
              <Alerta tipo="warning">
                Você está acima de {LIMITE_DE_ALERTA}% do limite em:{" "}
                {proximosDoLimite.map((c) => c.rotulo.toLowerCase()).join(", ")}.
              </Alerta>
            ) : null}
            {consumos.map((c) => (
              <BarraDeProgresso key={c.chave} valor={c.pct} rotulo={`${c.rotulo}: ${c.uso} de ${c.limite}`} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PaginaDoPlano;
