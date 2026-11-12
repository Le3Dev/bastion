import type { Severidade } from '@bastion/dominio-compartilhado';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { EstadoDoAchado } from '../../achados/dominio/EstadoDoAchado';
import type { Transacao } from '../../compartilhado/banco/conexao';
import {
  achados,
  avaliacoes,
  ocorrenciasDoAchado,
  relatorios,
  requisicoesDoGuardiao,
  sistemas,
} from '../../compartilhado/banco/esquema';
import type { Relatorio } from '../dominio/Relatorio';

export interface LinhaDeRelatorio {
  id: string;
  organizacaoId: string;
  avaliacaoId: string;
  sistemaId: string;
  sistemaNome: string;
  geradoEm: Date;
  nota: number;
  resumo: string;
  chaveDoPdf: string | null;
  perfil: 'PASSIVO' | 'PADRAO' | 'COMPLETO';
  notaMinima: number;
  urlDeHomologacao: string;
  dominioDeProducao: string;
}

export interface LinhaDeAchadoDoRelatorio {
  id: string;
  sistemaId: string;
  sistemaNome: string;
  titulo: string;
  tipo: string;
  severidade: Severidade;
  estado: EstadoDoAchado;
  local: string;
  descricao: string;
  correcaoSugerida: string;
  conformidade: { owasp: string[]; lgpd: string[] };
  ocorrencias: number;
  ultimaVezEm: Date;
}

const postoSql = sql<number>`case ${achados.severidade} when 'CRITICA' then 0 when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end`;

const colunasDeRelatorio = {
  id: relatorios.id,
  organizacaoId: relatorios.organizacaoId,
  avaliacaoId: relatorios.avaliacaoId,
  sistemaId: relatorios.sistemaId,
  sistemaNome: sistemas.nome,
  geradoEm: relatorios.geradoEm,
  nota: relatorios.nota,
  resumo: relatorios.resumo,
  chaveDoPdf: relatorios.chaveDoPdf,
  perfil: avaliacoes.perfil,
  notaMinima: avaliacoes.notaMinima,
  urlDeHomologacao: sistemas.urlDeHomologacao,
  dominioDeProducao: sistemas.dominioDeProducao,
};

export class RepositorioDeRelatorios {
  async inserir(tx: Transacao, relatorio: Relatorio): Promise<void> {
    const dados = relatorio.paraDados();
    await tx.insert(relatorios).values({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      avaliacaoId: dados.avaliacaoId,
      sistemaId: dados.sistemaId,
      geradoEm: dados.geradoEm,
      nota: dados.nota,
      resumo: dados.resumo,
    });
  }

  async buscarPorId(tx: Transacao, id: string): Promise<LinhaDeRelatorio | null> {
    const [linha] = await tx
      .select(colunasDeRelatorio)
      .from(relatorios)
      .innerJoin(sistemas, eq(relatorios.sistemaId, sistemas.id))
      .innerJoin(avaliacoes, eq(relatorios.avaliacaoId, avaliacoes.id))
      .where(eq(relatorios.id, id))
      .limit(1);
    return linha ?? null;
  }

  async buscarPorAvaliacao(
    tx: Transacao,
    avaliacaoId: string,
  ): Promise<{ id: string; nota: number } | null> {
    const [linha] = await tx
      .select({ id: relatorios.id, nota: relatorios.nota })
      .from(relatorios)
      .where(eq(relatorios.avaliacaoId, avaliacaoId))
      .limit(1);
    return linha ?? null;
  }

  async listar(tx: Transacao, avaliacaoId?: string): Promise<LinhaDeRelatorio[]> {
    return tx
      .select(colunasDeRelatorio)
      .from(relatorios)
      .innerJoin(sistemas, eq(relatorios.sistemaId, sistemas.id))
      .innerJoin(avaliacoes, eq(relatorios.avaliacaoId, avaliacoes.id))
      .where(avaliacaoId ? eq(relatorios.avaliacaoId, avaliacaoId) : undefined)
      .orderBy(desc(relatorios.geradoEm), desc(relatorios.id));
  }

  async definirChaveDoPdf(tx: Transacao, id: string, chave: string): Promise<void> {
    await tx.update(relatorios).set({ chaveDoPdf: chave }).where(eq(relatorios.id, id));
  }

  /** Achados com ocorrência na avaliação, do mais grave ao menos grave. */
  async achadosDaAvaliacao(tx: Transacao, avaliacaoId: string): Promise<LinhaDeAchadoDoRelatorio[]> {
    return tx
      .select({
        id: achados.id,
        sistemaId: achados.sistemaId,
        sistemaNome: sistemas.nome,
        titulo: achados.titulo,
        tipo: achados.tipo,
        severidade: achados.severidade,
        estado: achados.estado,
        local: achados.local,
        descricao: achados.descricao,
        correcaoSugerida: achados.correcaoSugerida,
        conformidade: achados.conformidade,
        ocorrencias: achados.ocorrencias,
        ultimaVezEm: achados.ultimaVezEm,
      })
      .from(achados)
      .innerJoin(ocorrenciasDoAchado, eq(ocorrenciasDoAchado.achadoId, achados.id))
      .innerJoin(sistemas, eq(achados.sistemaId, sistemas.id))
      .where(eq(ocorrenciasDoAchado.avaliacaoId, avaliacaoId))
      .orderBy(asc(postoSql), desc(achados.ultimaVezEm), desc(achados.id));
  }

  async contarRequisicoes(
    tx: Transacao,
    avaliacaoId: string,
  ): Promise<{ permitidas: number; bloqueadas: number }> {
    const linhas = await tx
      .select({ decisao: requisicoesDoGuardiao.decisao, total: sql<number>`count(*)::int` })
      .from(requisicoesDoGuardiao)
      .where(and(eq(requisicoesDoGuardiao.avaliacaoId, avaliacaoId)))
      .groupBy(requisicoesDoGuardiao.decisao);
    const total = (decisao: 'PERMITIDA' | 'BLOQUEADA'): number =>
      linhas.find((linha) => linha.decisao === decisao)?.total ?? 0;
    return { permitidas: total('PERMITIDA'), bloqueadas: total('BLOQUEADA') };
  }
}
