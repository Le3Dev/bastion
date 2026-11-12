import type { AvaliacaoDto, Severidade } from '@bastion/contratos';
import type { Avaliacao } from '../dominio/Avaliacao';

export interface ComplementosDaAvaliacao {
  sistemaNome: string;
  relatorioId: string | null;
  contagemDeAchados: Partial<Record<Severidade, number>>;
}

/** Garante todas as severidades na contagem (zero quando não há achados). */
export const contagemCompleta = (
  contagem: Partial<Record<Severidade, number>>,
): Record<Severidade, number> => ({
  CRITICA: contagem.CRITICA ?? 0,
  ALTA: contagem.ALTA ?? 0,
  MEDIA: contagem.MEDIA ?? 0,
  BAIXA: contagem.BAIXA ?? 0,
});

export const paraAvaliacaoDto = (
  avaliacao: Avaliacao,
  complementos: ComplementosDaAvaliacao,
): AvaliacaoDto => {
  const dados = avaliacao.paraDados();
  return {
    id: dados.id,
    sistemaId: dados.sistemaId,
    sistemaNome: complementos.sistemaNome,
    perfil: dados.perfil,
    origem: dados.origem,
    estado: dados.estado,
    progresso: avaliacao.progresso,
    nota: dados.nota,
    notaMinima: dados.notaMinima,
    aprovada: avaliacao.aprovada,
    etapas: dados.etapas.map((etapa) => ({
      ordem: etapa.ordem,
      nome: etapa.nome,
      estado: etapa.estado,
      progresso: etapa.progresso,
    })),
    solicitadaEm: dados.solicitadaEm.toISOString(),
    iniciadaEm: dados.iniciadaEm?.toISOString() ?? null,
    concluidaEm: dados.concluidaEm?.toISOString() ?? null,
    motivoDaFalha: dados.motivoDaFalha,
    relatorioId: complementos.relatorioId,
    contagemDeAchados: contagemCompleta(complementos.contagemDeAchados),
  };
};
