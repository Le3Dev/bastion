import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { registrosDeAuditoria } from '../../compartilhado/banco/esquema';
import { ACOES, type Acao } from '../dominio/Acao';
import { RegistroDeAuditoria } from '../dominio/RegistroDeAuditoria';

export interface FiltroDeAuditoria {
  ator?: string;
  acao?: string;
  busca?: string;
  /** Posição do último item da página anterior. */
  depoisDe?: { em: Date; id: string };
  limite: number;
}

const escaparLike = (valor: string): string => valor.replace(/[\\%_]/g, (c) => `\\${c}`);

const ehAcao = (valor: string): valor is Acao => (ACOES as readonly string[]).includes(valor);

/** Repositório só de inclusão e consulta: a trilha nunca é alterada nem removida. */
export class RepositorioDeAuditoria {
  async adicionar(tx: Transacao, registro: RegistroDeAuditoria): Promise<void> {
    const dados = registro.paraDados();
    await tx.insert(registrosDeAuditoria).values({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      em: dados.ocorridoEm,
      atorTipo: dados.ator.tipo,
      atorId: dados.ator.id,
      atorNome: dados.ator.nome,
      acao: dados.acao,
      alvo: dados.alvo,
      detalhe: JSON.parse(dados.detalhe) as Record<string, unknown>,
    });
  }

  async listar(
    tx: Transacao,
    organizacaoId: string,
    filtro: FiltroDeAuditoria,
  ): Promise<RegistroDeAuditoria[]> {
    const t = registrosDeAuditoria;
    const condicoes: (SQL | undefined)[] = [eq(t.organizacaoId, organizacaoId)];
    if (filtro.ator) {
      condicoes.push(ilike(t.atorNome, `%${escaparLike(filtro.ator)}%`));
    }
    if (filtro.acao) condicoes.push(eq(t.acao, filtro.acao));
    if (filtro.busca) {
      const padrao = `%${escaparLike(filtro.busca)}%`;
      condicoes.push(or(ilike(t.alvo, padrao), ilike(t.acao, padrao), ilike(t.atorNome, padrao)));
    }
    if (filtro.depoisDe) {
      condicoes.push(sql`(${t.em}, ${t.id}) < (${filtro.depoisDe.em.toISOString()}::timestamptz, ${filtro.depoisDe.id}::uuid)`);
    }
    const linhas = await tx
      .select()
      .from(t)
      .where(and(...condicoes))
      .orderBy(desc(t.em), desc(t.id))
      .limit(filtro.limite);
    return linhas
      .filter((linha) => ehAcao(linha.acao))
      .map((linha) =>
        RegistroDeAuditoria.reconstituir({
          id: linha.id,
          organizacaoId: linha.organizacaoId,
          ator: { tipo: linha.atorTipo, id: linha.atorId, nome: linha.atorNome },
          acao: linha.acao as Acao,
          alvo: linha.alvo,
          detalhe: JSON.stringify(linha.detalhe ?? {}),
          ocorridoEm: linha.em,
        }),
      );
  }
}
