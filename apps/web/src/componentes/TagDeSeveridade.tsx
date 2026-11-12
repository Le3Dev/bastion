import type { Severidade } from "@bastion/contratos";
import { classeDaSeveridade, rotuloDaSeveridade } from "@/apresentacao/rotulos";

interface PropsDaTag {
  severidade: Severidade;
}

export const TagDeSeveridade = ({ severidade }: PropsDaTag) => (
  <span className={`tag ${classeDaSeveridade(severidade)}`}>{rotuloDaSeveridade(severidade)}</span>
);
