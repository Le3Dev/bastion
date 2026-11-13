import { and, desc, eq } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { agendamentos } from '../../compartilhado/banco/esquema';
import { AgendamentoDeAvaliacao } from '../dominio/AgendamentoDeAvaliacao';

type Linha = typeof agendamentos.$inferSelect;

const paraAgregado = (linha: Linha): AgendamentoDeAvaliacao =>
  AgendamentoDeAvaliacao.reconstituir({
    id: linha.id,
    organizacaoId: linha.organizacaoId,
    sistemaId: linha.sistemaId,
    perfil: linha.perfil,
    notaMinima: linha.notaMinima,
    frequencia: linha.frequencia,
    horario: linha.horario,
    diaDaSemana: linha.diaDaSemana,
    diaDoMes: linha.diaDoMes,
    autorizacao: linha.autorizacao ?? null,
    permitirCriacaoDeDados: linha.permitirCriacaoDeDados,
    ativo: linha.ativo,
    criadoEm: linha.criadoEm,
  });

export class RepositorioDeAgendamentos {
  async inserir(tx: Transacao, agendamento: AgendamentoDeAvaliacao): Promise<void> {
    const dados = agendamento.paraDados();
    await tx.insert(agendamentos).values({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      sistemaId: dados.sistemaId,
      perfil: dados.perfil,
      notaMinima: dados.notaMinima,
      frequencia: dados.frequencia,
      horario: dados.horario,
      diaDaSemana: dados.diaDaSemana,
      diaDoMes: dados.diaDoMes,
      autorizacao: dados.autorizacao,
      permitirCriacaoDeDados: dados.permitirCriacaoDeDados,
      ativo: dados.ativo,
      criadoEm: dados.criadoEm,
    });
  }

  async salvar(tx: Transacao, agendamento: AgendamentoDeAvaliacao): Promise<void> {
    const dados = agendamento.paraDados();
    await tx
      .update(agendamentos)
      .set({ ativo: dados.ativo })
      .where(
        and(eq(agendamentos.id, dados.id), eq(agendamentos.organizacaoId, dados.organizacaoId)),
      );
  }

  async buscarPorId(
    tx: Transacao,
    organizacaoId: string,
    id: string,
  ): Promise<AgendamentoDeAvaliacao | null> {
    const [linha] = await tx
      .select()
      .from(agendamentos)
      .where(and(eq(agendamentos.id, id), eq(agendamentos.organizacaoId, organizacaoId)))
      .limit(1);
    return linha ? paraAgregado(linha) : null;
  }

  async listar(tx: Transacao, organizacaoId: string): Promise<AgendamentoDeAvaliacao[]> {
    const linhas = await tx
      .select()
      .from(agendamentos)
      .where(eq(agendamentos.organizacaoId, organizacaoId))
      .orderBy(desc(agendamentos.criadoEm));
    return linhas.map(paraAgregado);
  }

  async listarAtivosPorSistema(
    tx: Transacao,
    organizacaoId: string,
    sistemaId: string,
  ): Promise<AgendamentoDeAvaliacao[]> {
    const linhas = await tx
      .select()
      .from(agendamentos)
      .where(
        and(
          eq(agendamentos.organizacaoId, organizacaoId),
          eq(agendamentos.sistemaId, sistemaId),
          eq(agendamentos.ativo, true),
        ),
      );
    return linhas.map(paraAgregado);
  }

  async remover(tx: Transacao, organizacaoId: string, id: string): Promise<void> {
    await tx
      .delete(agendamentos)
      .where(and(eq(agendamentos.id, id), eq(agendamentos.organizacaoId, organizacaoId)));
  }
}
