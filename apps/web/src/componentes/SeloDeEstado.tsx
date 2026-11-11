import {
  rotuloDoEstadoDaAvaliacao,
  rotuloDoEstadoDaVerificacao,
  rotuloDoEstadoDoAchado,
} from "@/prototipo/rotulos";
import type { EstadoDaAvaliacao, EstadoDaVerificacao, EstadoDoAchado } from "@/prototipo/tipos";

type PropsDoSelo =
  | { tipo: "avaliacao"; estado: EstadoDaAvaliacao }
  | { tipo: "achado"; estado: EstadoDoAchado }
  | { tipo: "verificacao"; estado: EstadoDaVerificacao };

const classeDaAvaliacao: Record<EstadoDaAvaliacao, string> = {
  RASCUNHO: "tag-neutra",
  AGUARDANDO_VERIFICACAO: "tag-alta",
  NA_FILA: "tag-media",
  PREPARANDO: "tag-media",
  EM_EXECUCAO: "tag-info-forte",
  ANALISANDO: "tag-info-forte",
  CONCLUIDA: "tag-sucesso",
  FALHOU: "tag-critica",
  CANCELADA: "tag-neutra",
};

const classeDoAchado: Record<EstadoDoAchado, string> = {
  NOVO: "tag-info-forte",
  CONFIRMADO: "tag-alta",
  EM_CORRECAO: "tag-media",
  REVALIDANDO: "tag-media",
  CORRIGIDO: "tag-sucesso",
  REABERTO: "tag-critica",
  RISCO_ACEITO: "tag-neutra",
};

const classeDaVerificacao: Record<EstadoDaVerificacao, string> = {
  PENDENTE: "tag-alta",
  VERIFICADO: "tag-sucesso",
  FALHOU: "tag-critica",
  EXPIRADO: "tag-neutra",
};

export const SeloDeEstado = (props: PropsDoSelo) => {
  if (props.tipo === "avaliacao") {
    return <span className={`tag ${classeDaAvaliacao[props.estado]}`}>{rotuloDoEstadoDaAvaliacao(props.estado)}</span>;
  }
  if (props.tipo === "achado") {
    return <span className={`tag ${classeDoAchado[props.estado]}`}>{rotuloDoEstadoDoAchado(props.estado)}</span>;
  }
  return (
    <span className={`tag ${classeDaVerificacao[props.estado]}`}>{rotuloDoEstadoDaVerificacao(props.estado)}</span>
  );
};
