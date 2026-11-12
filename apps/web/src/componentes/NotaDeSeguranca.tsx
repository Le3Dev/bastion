import { faixaDaNota } from "@/apresentacao/nota";

interface PropsDaNota {
  nota: number | null;
  tamanho?: "normal" | "grande";
}

export const NotaDeSeguranca = ({ nota, tamanho = "normal" }: PropsDaNota) => {
  if (nota === null) {
    return <span className={`nota nota-${tamanho} nota-sem`}>--</span>;
  }
  return (
    <span className={`nota nota-${tamanho} nota-${faixaDaNota(nota)}`} aria-label={`Nota de segurança ${nota} de 100`}>
      {nota}
      <span className="nota-escala">/100</span>
    </span>
  );
};
