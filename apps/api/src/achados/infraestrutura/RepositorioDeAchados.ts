import type { Severidade } from '@bastion/dominio-compartilhado';
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import {
  achados,
  historicoDoAchado,
  ocorrenciasDoAchado,
  sistemas,
} from '../../compartilhado/banco/esquema';
import { Achado } from '../dominio/Achado';
import type { EstadoDoAchado } from '../dominio/EstadoDoAchado';

/** Posição (severidade, última vez e id) do último item de uma página. */
export interface PosicaoDoCursorDeAchados {
  posto: number;
  ultimaVezEm: Date;
  id: string;
}

export interface ResumoDeAchado {
  id: string;
  sistemaId: string;
  sistemaNome: string;
  titulo: string;
  tipo: string;
  severidade: Severidade;
  estado: EstadoDoAchado;
  local: string;
  ocorrencias: number;
  ultimaVezEm: Date;
}

export interface FiltroDeAchados {
  severidades?: readonly Severidade[];
  estado?: EstadoDoAchado;
  sistemaId?: string;
  busca?: string;
  /** Sem isto, CORRIGIDO e RISCO_ACEITO ficam escondidos (a menos que o estado seja pedido). */
  incluirFechados: boolean;
  avaliacaoId?: string;
  depoisDe?: PosicaoDoCursorDeAchados;
  limite: number;
}

export type ContagemPorSeveridade = Record<Severidade, number>;

export const ESTADOS_FECHADOS: readonly EstadoDoAchado[] = ['CORRIGIDO', 'RISCO_ACEITO'];

/** Ordem de exibição: a mais grave primeiro. */
export const POSTO_DA_SEVERIDADE: Readonly<Record<Severidade, number>> = {
  CRITICA: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

const postoSql = sql<number>`case ${achados.severidade} when 'CRITICA' then 0 when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end`;

const colunasDoResumo = {
  id: achados.id,
  sistemaId: achados.sistemaId,
  sistemaNome: sistemas.nome,
  titulo: achados.titulo,
  tipo: achados.tipo,
  severidade: achados.severidade,
  estado: achados.estado,
  local: achados.local,
  ocorrencias: achados.ocorrencias,
  ultimaVezEm: achados.ultimaVezEm,
};

const escaparParaIlike = (texto: string): string => texto.replace(/[\\%_]/g, '\\$&');

const contagemVazia = (): ContagemPorSeveridade => ({ CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 });

export class RepositorioDeAchados {
  /** Carrega o agregado. `paraAtualizar` trava a linha do achado até o fim da transação. */
  async buscarPorId(
    tx: Transacao,
    id: string,
    paraAtualizar = false,
  ): Promise<{ achado: Achado; sistemaNome: string } | null> {
    const consulta = tx
      .select({ linha: achados, sistemaNome: sistemas.nome })
      .from(achados)
      .innerJoin(sistemas, eq(achados.sistemaId, sistemas.id))
      .where(eq(achados.id, id))
      .limit(1);
    const [encontrado] = paraAtualizar ? await consulta.for('update', { of: achados }) : await consulta;
    if (!encontrado) return null;
    return { achado: await this.montar(tx, encontrado.linha), sistemaNome: encontrado.sistemaNome };
  }

  async buscarPorImpressao(tx: Transacao, impressaoDigital: string): Promise<Achado | null> {
    const [linha] = await tx
      .select()
      .from(achados)
      .where(eq(achados.impressaoDigital, impressaoDigital))
      .limit(1)
      .for('update');
    return linha ? this.montar(tx, linha) : null;
  }

  async nomeDoSistema(tx: Transacao, sistemaId: string): Promise<string> {
    const [linha] = await tx
      .select({ nome: sistemas.nome })
      .from(sistemas)
      .where(eq(sistemas.id, sistemaId))
      .limit(1);
    return linha?.nome ?? '';
  }

  async inserir(tx: Transacao, achado: Achado, agora: Date): Promise<void> {
    const dados = achado.paraDados();
    await tx.insert(achados).values({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      sistemaId: dados.sistemaId,
      impressaoDigital: dados.impressaoDigital,
      tipo: dados.tipo,
      titulo: dados.titulo,
      severidade: dados.severidade,
      estado: dados.estado,
      local: dados.local,
      descricao: dados.descricao,
      evidencia: dados.evidencia,
      correcaoSugerida: dados.correcaoSugerida,
      conformidade: {
        owasp: [...dados.conformidade.owasp],
        lgpd: [...dados.conformidade.lgpd],
      },
      ocorrencias: dados.ocorrencias,
      primeiraVezEm: dados.primeiraVezEm,
      ultimaVezEm: dados.ultimaVezEm,
      riscoAceito: null,
    });
    await this.gravarFilhos(tx, achado, 0, agora);
  }

  /** Atualiza o achado e acrescenta o que é novo no histórico e nas ocorrências. */
  async salvar(tx: Transacao, achado: Achado, agora: Date): Promise<void> {
    const dados = achado.paraDados();
    await tx
      .update(achados)
      .set({
        estado: dados.estado,
        ocorrencias: dados.ocorrencias,
        ultimaVezEm: dados.ultimaVezEm,
        riscoAceito:
          dados.riscoAceito === null
            ? null
            : {
                justificativa: dados.riscoAceito.justificativa,
                responsavel: dados.riscoAceito.responsavel,
                validoAte: dados.riscoAceito.validoAte.toISOString(),
              },
      })
      .where(eq(achados.id, dados.id));
    const [contagem] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(historicoDoAchado)
      .where(eq(historicoDoAchado.achadoId, dados.id));
    await this.gravarFilhos(tx, achado, contagem?.total ?? 0, agora);
  }

  async temOcorrenciaNaAvaliacao(tx: Transacao, achadoId: string, avaliacaoId: string): Promise<boolean> {
    const [linha] = await tx
      .select({ achadoId: ocorrenciasDoAchado.achadoId })
      .from(ocorrenciasDoAchado)
      .where(
        and(eq(ocorrenciasDoAchado.achadoId, achadoId), eq(ocorrenciasDoAchado.avaliacaoId, avaliacaoId)),
      )
      .limit(1);
    return linha !== undefined;
  }

  async listar(tx: Transacao, filtro: FiltroDeAchados): Promise<ResumoDeAchado[]> {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.severidades && filtro.severidades.length > 0) {
      condicoes.push(inArray(achados.severidade, [...filtro.severidades]));
    }
    if (filtro.estado) condicoes.push(eq(achados.estado, filtro.estado));
    else if (!filtro.incluirFechados) condicoes.push(notInArray(achados.estado, [...ESTADOS_FECHADOS]));
    if (filtro.sistemaId) condicoes.push(eq(achados.sistemaId, filtro.sistemaId));
    if (filtro.busca) {
      const padrao = `%${escaparParaIlike(filtro.busca)}%`;
      condicoes.push(or(ilike(achados.titulo, padrao), ilike(achados.local, padrao)));
    }
    if (filtro.avaliacaoId) {
      condicoes.push(
        inArray(
          achados.id,
          tx
            .select({ id: ocorrenciasDoAchado.achadoId })
            .from(ocorrenciasDoAchado)
            .where(eq(ocorrenciasDoAchado.avaliacaoId, filtro.avaliacaoId)),
        ),
      );
    }
    if (filtro.depoisDe) {
      const { posto, ultimaVezEm, id } = filtro.depoisDe;
      const instante = ultimaVezEm.toISOString();
      condicoes.push(
        sql`(${postoSql} > ${posto} or (${postoSql} = ${posto} and (${achados.ultimaVezEm} < ${instante}::timestamptz or (${achados.ultimaVezEm} = ${instante}::timestamptz and ${achados.id} < ${id}::uuid))))`,
      );
    }
    const linhas = await tx
      .select(colunasDoResumo)
      .from(achados)
      .innerJoin(sistemas, eq(achados.sistemaId, sistemas.id))
      .where(and(...condicoes))
      .orderBy(asc(postoSql), desc(achados.ultimaVezEm), desc(achados.id))
      .limit(filtro.limite);
    return linhas;
  }

  /** Achados em aberto da organização do contexto, por severidade. */
  async contarEmAbertoPorSeveridade(tx: Transacao): Promise<ContagemPorSeveridade> {
    const linhas = await tx
      .select({ severidade: achados.severidade, total: sql<number>`count(*)::int` })
      .from(achados)
      .where(notInArray(achados.estado, [...ESTADOS_FECHADOS]))
      .groupBy(achados.severidade);
    return this.paraContagem(linhas);
  }

  /** Achados em aberto que têm ocorrência na avaliação, por severidade. */
  async contarEmAbertoDaAvaliacao(tx: Transacao, avaliacaoId: string): Promise<ContagemPorSeveridade> {
    const linhas = await tx
      .select({ severidade: achados.severidade, total: sql<number>`count(*)::int` })
      .from(achados)
      .innerJoin(ocorrenciasDoAchado, eq(ocorrenciasDoAchado.achadoId, achados.id))
      .where(
        and(
          eq(ocorrenciasDoAchado.avaliacaoId, avaliacaoId),
          notInArray(achados.estado, [...ESTADOS_FECHADOS]),
        ),
      )
      .groupBy(achados.severidade);
    return this.paraContagem(linhas);
  }

  private paraContagem(linhas: readonly { severidade: Severidade; total: number }[]): ContagemPorSeveridade {
    const contagem = contagemVazia();
    for (const linha of linhas) contagem[linha.severidade] = linha.total;
    return contagem;
  }

  private async gravarFilhos(
    tx: Transacao,
    achado: Achado,
    historicoJaGravado: number,
    agora: Date,
  ): Promise<void> {
    const dados = achado.paraDados();
    const novas = dados.historico.slice(historicoJaGravado);
    if (novas.length > 0) {
      await tx.insert(historicoDoAchado).values(
        novas.map((entrada) => ({
          organizacaoId: dados.organizacaoId,
          achadoId: dados.id,
          em: entrada.em,
          de: entrada.de,
          para: entrada.para,
          ator: entrada.ator,
          comentario: entrada.comentario,
        })),
      );
    }
    if (dados.avaliacaoIds.length > 0) {
      await tx
        .insert(ocorrenciasDoAchado)
        .values(
          dados.avaliacaoIds.map((avaliacaoId) => ({
            organizacaoId: dados.organizacaoId,
            achadoId: dados.id,
            avaliacaoId,
            em: agora,
          })),
        )
        .onConflictDoNothing();
    }
  }

  private async montar(tx: Transacao, linha: typeof achados.$inferSelect): Promise<Achado> {
    const historico = await tx
      .select()
      .from(historicoDoAchado)
      .where(eq(historicoDoAchado.achadoId, linha.id))
      .orderBy(asc(historicoDoAchado.em));
    const ocorrencias = await tx
      .select({ avaliacaoId: ocorrenciasDoAchado.avaliacaoId })
      .from(ocorrenciasDoAchado)
      .where(eq(ocorrenciasDoAchado.achadoId, linha.id))
      .orderBy(asc(ocorrenciasDoAchado.em));
    return Achado.reconstituir({
      id: linha.id,
      organizacaoId: linha.organizacaoId,
      sistemaId: linha.sistemaId,
      impressaoDigital: linha.impressaoDigital,
      tipo: linha.tipo,
      titulo: linha.titulo,
      severidade: linha.severidade,
      local: linha.local,
      descricao: linha.descricao,
      evidencia: linha.evidencia,
      correcaoSugerida: linha.correcaoSugerida,
      conformidade: linha.conformidade,
      estado: linha.estado,
      ocorrencias: linha.ocorrencias,
      avaliacaoIds: ocorrencias.map((o) => o.avaliacaoId),
      primeiraVezEm: linha.primeiraVezEm,
      ultimaVezEm: linha.ultimaVezEm,
      riscoAceito:
        linha.riscoAceito === null
          ? null
          : {
              justificativa: linha.riscoAceito.justificativa,
              responsavel: linha.riscoAceito.responsavel,
              validoAte: new Date(linha.riscoAceito.validoAte),
            },
      historico: historico.map((h) => ({
        em: h.em,
        de: h.de,
        para: h.para,
        ator: h.ator,
        comentario: h.comentario,
      })),
    });
  }
}
