interface PropsDaBarra {
  valor: number;
  rotulo?: string;
}

export const BarraDeProgresso = ({ valor, rotulo }: PropsDaBarra) => {
  const limitado = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div>
      {rotulo ? (
        <div className="linha texto-2" style={{ justifyContent: "space-between" }}>
          <span>{rotulo}</span>
          <span className="mono">{limitado}%</span>
        </div>
      ) : null}
      <div
        className="barra-progresso"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={limitado}
        aria-label={rotulo ?? "Progresso"}
      >
        <div className="barra-progresso-preenchimento" style={{ width: `${limitado}%` }} />
      </div>
    </div>
  );
};
