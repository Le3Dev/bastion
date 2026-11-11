"use client";

import { Alerta } from "@/componentes/Alerta";
import { BarraDeProgresso } from "@/componentes/BarraDeProgresso";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { formatarMoeda } from "@/prototipo/formatacao";
import { useArmazem } from "@/prototipo/useArmazem";

const LIMITE_DE_ALERTA = 80;

const percentual = (uso: number, limite: number): number => (limite > 0 ? Math.round((uso / limite) * 100) : 0);

const PaginaDoPlano = () => {
  const { plano, organizacao } = useArmazem();

  const consumos = [
    { chave: "sistemas", rotulo: "Sistemas", uso: plano.uso.sistemas, limite: plano.limites.sistemas },
    { chave: "avaliacoes", rotulo: "Avaliações no mês", uso: plano.uso.avaliacoesPorMes, limite: plano.limites.avaliacoesPorMes },
    { chave: "membros", rotulo: "Membros", uso: plano.uso.membros, limite: plano.limites.membros },
  ].map((c) => ({ ...c, pct: percentual(c.uso, c.limite) }));

  const proximosDoLimite = consumos.filter((c) => c.pct > LIMITE_DE_ALERTA);

  return (
    <div className="page pilha">
      <CabecalhoDaPagina
        titulo="Plano e cobrança"
        descricao="Consumo da organização e histórico de faturas."
        acoes={
          <div className="pilha" style={{ gap: "var(--esp-1)" }}>
            <button type="button" className="btn btn-outline" disabled>
              Alterar plano
            </button>
          </div>
        }
      />

      <Alerta tipo="info">Cobrança real fora do MVP: valores fictícios.</Alerta>

      <div className="card kpi">
        <span className="kpi-rotulo">Plano atual</span>
        <span className="kpi-valor">{plano.nome}</span>
        <span className="texto-2">{organizacao.nome}</span>
      </div>

      <div className="card pilha">
        <h2 className="card-titulo">Uso e limites</h2>
        {proximosDoLimite.length > 0 ? (
          <Alerta tipo="warning">
            Você está acima de {LIMITE_DE_ALERTA}% do limite em: {proximosDoLimite.map((c) => c.rotulo.toLowerCase()).join(", ")}.
          </Alerta>
        ) : null}
        {consumos.map((c) => (
          <BarraDeProgresso key={c.chave} valor={c.pct} rotulo={`${c.rotulo}: ${c.uso} de ${c.limite}`} />
        ))}
      </div>

      <div className="card">
        <h2 className="card-titulo">Faturas</h2>
        {plano.faturas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma fatura ainda" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Valor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {plano.faturas.map((f) => (
                <tr key={f.id}>
                  <td>{f.competencia}</td>
                  <td className="mono">{formatarMoeda(f.valor)}</td>
                  <td>
                    <span className={f.estado === "PAGA" ? "tag tag-sucesso" : "tag tag-alta"}>
                      {f.estado === "PAGA" ? "Paga" : "Em aberto"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaginaDoPlano;
