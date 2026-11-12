import type { EstadoDaAvaliacao } from '@bastion/contratos';
import { and, desc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import {
  avaliacoes,
  etapasDaAvaliacao,
  requisicoesDoGuardiao,
  sistemas,
} from '../../compartilhado/banco/esquema';
import { Avaliacao } from '../dominio/Avaliacao';

type LinhaDeAvaliacao = typeof avaliacoes.$inferSelect;
type LinhaDeEtapa = typeof etapasDaAvaliacao.$inferSelect;
type LinhaDeRequisicao = typeof requisicoesDoGuardiao.$inferSelect;

const ESTADOS_FINAIS: EstadoDaAvaliacao[] = ['CONCLUIDA', 'FALHOU', 'CANCELADA'];

const paraAgregado = (linha: LinhaDeAvaliacao, etapas: readonly LinhaDeEtapa[]): Avaliacao =>
  Avaliacao.reconstituir({
    id: linha.id,
    organizacaoId: linha.organizacaoId,
    sistemaId: linha.sistemaId,
    perfil: linha.perfil,
    agenda: { tipo: 'UNICA', frequencia: null },
    notaMinima: linha.notaMinima,
    origem: linha.origem,
    solicitadaPor: linha.solicitadaPor,
    estado: linha.estado,
    estadoDesde: linha.estadoDesde,
    nota: linha.nota,
    etapas: [...etapas]
      .sort((a, b) => a.ordem - b.ordem)
      .map((etapa) => ({
        ordem: etapa.ordem,
        nome: etapa.nome,
        estado: etapa.estado,
        progresso: etapa.progresso,
      })),
    solicitadaEm: linha.solicitadaEm,
    iniciadaEm: linha.iniciadaEm,
    concluidaEm: linha.concluidaEm,
    motivoDaFalha: linha.motivoDaFalha,
    achadoRevalidadoId: linha.achadoRevalidadoId,
    autorizacao: linha.autorizacao,
    permitirCriacaoDeDados: linha.permitirCriacaoDeDados,
  });

export interface FiltroDeAvaliacoes {
  sistemaId?: string;
  estado?: EstadoDaAvaliacao;
  /** Posição da última avaliação da página anterior. */
  depoisDe?: { em: Date; id: string };
  limite: number;
}

export interface NovaRequisicaoDoGuardiao {
  organizacaoId: string;
  avaliacaoId: string;
  em: Date;
  metodo: string;
  url: string;
  decisao: 'PERMITIDA' | 'BLOQUEADA';
  motivo: string;
  status: number | null;
}

export class RepositorioDeAvaliacoes {
  async inserir(tx: Transacao, avaliacao: Avaliacao): Promise<void> {
    const dados = avaliacao.paraDados();
    await tx.insert(avaliacoes).values({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      sistemaId: dados.sistemaId,
      perfil: dados.perfil,
      origem: dados.origem,
      estado: dados.estado,
      notaMinima: dados.notaMinima,
      nota: dados.nota,
      solicitadaPor: dados.solicitadaPor,
      solicitadaEm: dados.solicitadaEm,
      iniciadaEm: dados.iniciadaEm,
      estadoDesde: dados.estadoDesde,
      concluidaEm: dados.concluidaEm,
      motivoDaFalha: dados.motivoDaFalha,
      achadoRevalidadoId: dados.achadoRevalidadoId ?? null,
      autorizacao: dados.autorizacao ?? null,
      permitirCriacaoDeDados: dados.permitirCriacaoDeDados ?? false,
    });
    if (dados.etapas.length > 0) {
      await tx.insert(etapasDaAvaliacao).values(
        dados.etapas.map((etapa) => ({
          organizacaoId: dados.organizacaoId,
          avaliacaoId: dados.id,
          ordem: etapa.ordem,
          nome: etapa.nome,
          estado: etapa.estado,
          progresso: etapa.progresso,
        })),
      );
    }
  }

  async salvar(tx: Transacao, avaliacao: Avaliacao): Promise<void> {
    const dados = avaliacao.paraDados();
    await tx
      .update(avaliacoes)
      .set({
        estado: dados.estado,
        estadoDesde: dados.estadoDesde,
        nota: dados.nota,
        iniciadaEm: dados.iniciadaEm,
        concluidaEm: dados.concluidaEm,
        motivoDaFalha: dados.motivoDaFalha,
      })
      .where(and(eq(avaliacoes.id, dados.id), eq(avaliacoes.organizacaoId, dados.organizacaoId)));
    for (const etapa of dados.etapas) {
      await tx
        .update(etapasDaAvaliacao)
        .set({ estado: etapa.estado, progresso: etapa.progresso })
        .where(
          and(eq(etapasDaAvaliacao.avaliacaoId, dados.id), eq(etapasDaAvaliacao.ordem, etapa.ordem)),
        );
    }
  }

  /** Com `bloquear`, trava a linha (FOR UPDATE) para serializar mudanças concorrentes de estado. */
  async buscarPorId(
    tx: Transacao,
    organizacaoId: string,
    id: string,
    bloquear = false,
  ): Promise<Avaliacao | null> {
    const consulta = tx
      .select()
      .from(avaliacoes)
      .where(and(eq(avaliacoes.id, id), eq(avaliacoes.organizacaoId, organizacaoId)))
      .limit(1);
    const [linha] = bloquear ? await consulta.for('update') : await consulta;
    if (!linha) return null;
    const etapas = await tx
      .select()
      .from(etapasDaAvaliacao)
      .where(eq(etapasDaAvaliacao.avaliacaoId, id));
    return paraAgregado(linha, etapas);
  }

  async listar(
    tx: Transacao,
    organizacaoId: string,
    filtro: FiltroDeAvaliacoes,
  ): Promise<Avaliacao[]> {
    const t = avaliacoes;
    const condicoes: (SQL | undefined)[] = [eq(t.organizacaoId, organizacaoId)];
    if (filtro.sistemaId) condicoes.push(eq(t.sistemaId, filtro.sistemaId));
    if (filtro.estado) condicoes.push(eq(t.estado, filtro.estado));
    if (filtro.depoisDe) {
      condicoes.push(
        sql`(${t.solicitadaEm}, ${t.id}) < (${filtro.depoisDe.em.toISOString()}::timestamptz, ${filtro.depoisDe.id}::uuid)`,
      );
    }
    const linhas = await tx
      .select()
      .from(t)
      .where(and(...condicoes))
      .orderBy(desc(t.solicitadaEm), desc(t.id))
      .limit(filtro.limite);
    return this.comEtapas(tx, linhas);
  }

  /** Avaliações do sistema que esperam a verificação de propriedade (travadas para atualização). */
  async listarAguardandoVerificacao(
    tx: Transacao,
    organizacaoId: string,
    sistemaId: string,
  ): Promise<Avaliacao[]> {
    const linhas = await tx
      .select()
      .from(avaliacoes)
      .where(
        and(
          eq(avaliacoes.organizacaoId, organizacaoId),
          eq(avaliacoes.sistemaId, sistemaId),
          eq(avaliacoes.estado, 'AGUARDANDO_VERIFICACAO'),
        ),
      )
      .orderBy(avaliacoes.solicitadaEm)
      .for('update');
    return this.comEtapas(tx, linhas);
  }

  async notaMinimaDaUltimaAvaliacao(tx: Transacao, sistemaId: string): Promise<number | null> {
    const [linha] = await tx
      .select({ notaMinima: avaliacoes.notaMinima })
      .from(avaliacoes)
      .where(eq(avaliacoes.sistemaId, sistemaId))
      .orderBy(desc(avaliacoes.solicitadaEm), desc(avaliacoes.id))
      .limit(1);
    return linha?.notaMinima ?? null;
  }

  async contarEmAndamento(tx: Transacao, organizacaoId: string): Promise<number> {
    const [linha] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(avaliacoes)
      .where(
        and(
          eq(avaliacoes.organizacaoId, organizacaoId),
          notInArray(avaliacoes.estado, ESTADOS_FINAIS),
        ),
      );
    return linha?.total ?? 0;
  }

  async nomesDosSistemas(tx: Transacao, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const linhas = await tx
      .select({ id: sistemas.id, nome: sistemas.nome })
      .from(sistemas)
      .where(inArray(sistemas.id, [...ids]));
    return new Map(linhas.map((linha) => [linha.id, linha.nome]));
  }

  async inserirRequisicao(tx: Transacao, requisicao: NovaRequisicaoDoGuardiao): Promise<LinhaDeRequisicao> {
    const [linha] = await tx
      .insert(requisicoesDoGuardiao)
      .values({
        organizacaoId: requisicao.organizacaoId,
        avaliacaoId: requisicao.avaliacaoId,
        em: requisicao.em,
        metodo: requisicao.metodo,
        url: requisicao.url,
        decisao: requisicao.decisao,
        motivo: requisicao.motivo,
        status: requisicao.status,
      })
      .returning();
    if (!linha) throw new Error('Não foi possível registrar a requisição do Guardião.');
    return linha;
  }

  async listarRequisicoes(
    tx: Transacao,
    organizacaoId: string,
    avaliacaoId: string,
  ): Promise<LinhaDeRequisicao[]> {
    return tx
      .select()
      .from(requisicoesDoGuardiao)
      .where(
        and(
          eq(requisicoesDoGuardiao.organizacaoId, organizacaoId),
          eq(requisicoesDoGuardiao.avaliacaoId, avaliacaoId),
        ),
      )
      .orderBy(requisicoesDoGuardiao.em, requisicoesDoGuardiao.id);
  }

  private async comEtapas(tx: Transacao, linhas: readonly LinhaDeAvaliacao[]): Promise<Avaliacao[]> {
    if (linhas.length === 0) return [];
    const etapas = await tx
      .select()
      .from(etapasDaAvaliacao)
      .where(
        inArray(
          etapasDaAvaliacao.avaliacaoId,
          linhas.map((linha) => linha.id),
        ),
      );
    return linhas.map((linha) =>
      paraAgregado(
        linha,
        etapas.filter((etapa) => etapa.avaliacaoId === linha.id),
      ),
    );
  }
}
