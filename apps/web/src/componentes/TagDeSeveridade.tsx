import { classeDaSeveridade, rotuloDaSeveridade } from "@/prototipo/rotulos";
import type { Severidade } from "@/prototipo/tipos";

interface PropsDaTag {
  severidade: Severidade;
}

export const TagDeSeveridade = ({ severidade }: PropsDaTag) => (
  <span className={`tag ${classeDaSeveridade(severidade)}`}>{rotuloDaSeveridade(severidade)}</span>
);
