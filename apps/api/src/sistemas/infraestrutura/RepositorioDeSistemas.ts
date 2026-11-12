import { and, desc, eq } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { sistemas } from '../../compartilhado/banco/esquema';
import { Sistema } from '../dominio/Sistema';

type LinhaDeSistema = typeof sistemas.$inferSelect;

const paraAgregado = (linha: LinhaDeSistema): Sistema =>
  Sistema.reconstituir({
    id: linha.id,
    organizacaoId: linha.organizacaoId,
    nome: linha.nome,
    tipo: linha.tipo,
    urlDeHomologacao: linha.urlDeHomologacao,
    dominioDeProducao: linha.dominioDeProducao,
    verificacao: {
      metodo: linha.verificacaoMetodo,
      token: linha.verificacaoToken,
      estado: linha.verificacaoEstado,
      verificadoEm: linha.verificacaoVerificadaEm,
      expiraEm: linha.verificacaoExpiraEm,
      mensagem: linha.verificacaoMensagem,
    },
    ultimaNota: linha.ultimaNota,
    criadoEm: linha.criadoEm,
    credencialDeTeste: linha.credencialDeTeste,
    conectorDeIa: linha.conectorDeIa,
    permitirCriacaoDeDadosDeTeste: linha.permitirCriacaoDeDadosDeTeste,
  });

export class RepositorioDeSistemas {
  async inserir(tx: Transacao, sistema: Sistema): Promise<void> {
    const dados = sistema.paraDados();
    await tx.insert(sistemas).values({
      id: dados.id,
      organizacaoId: dados.organizacaoId,
      nome: dados.nome,
      tipo: dados.tipo,
      urlDeHomologacao: dados.urlDeHomologacao,
      hostDeHomologacao: sistema.hostDeHomologacao,
      dominioDeProducao: dados.dominioDeProducao,
      verificacaoMetodo: dados.verificacao.metodo,
      verificacaoToken: dados.verificacao.token,
      verificacaoEstado: dados.verificacao.estado,
      verificacaoVerificadaEm: dados.verificacao.verificadoEm,
      verificacaoExpiraEm: dados.verificacao.expiraEm,
      verificacaoMensagem: dados.verificacao.mensagem,
      ultimaNota: dados.ultimaNota,
      criadoEm: dados.criadoEm,
    });
  }

  async salvar(tx: Transacao, sistema: Sistema): Promise<void> {
    const dados = sistema.paraDados();
    await tx
      .update(sistemas)
      .set({
        verificacaoMetodo: dados.verificacao.metodo,
        verificacaoToken: dados.verificacao.token,
        verificacaoEstado: dados.verificacao.estado,
        verificacaoVerificadaEm: dados.verificacao.verificadoEm,
        verificacaoExpiraEm: dados.verificacao.expiraEm,
        verificacaoMensagem: dados.verificacao.mensagem,
        ultimaNota: dados.ultimaNota,
        credencialDeTeste: dados.credencialDeTeste ?? null,
        conectorDeIa: dados.conectorDeIa
          ? { ...dados.conectorDeIa, frasesSigilosas: [...dados.conectorDeIa.frasesSigilosas] }
          : null,
        permitirCriacaoDeDadosDeTeste: dados.permitirCriacaoDeDadosDeTeste ?? false,
      })
      .where(and(eq(sistemas.id, dados.id), eq(sistemas.organizacaoId, dados.organizacaoId)));
  }

  async buscarPorId(tx: Transacao, organizacaoId: string, id: string): Promise<Sistema | null> {
    const [linha] = await tx
      .select()
      .from(sistemas)
      .where(and(eq(sistemas.id, id), eq(sistemas.organizacaoId, organizacaoId)))
      .limit(1);
    return linha ? paraAgregado(linha) : null;
  }

  /** Confia no RLS da transação para limitar à organização do contexto. */
  async buscarPorIdNoContexto(tx: Transacao, id: string): Promise<Sistema | null> {
    const [linha] = await tx.select().from(sistemas).where(eq(sistemas.id, id)).limit(1);
    return linha ? paraAgregado(linha) : null;
  }

  async contar(tx: Transacao, organizacaoId: string): Promise<number> {
    const linhas = await tx
      .select({ id: sistemas.id })
      .from(sistemas)
      .where(eq(sistemas.organizacaoId, organizacaoId));
    return linhas.length;
  }

  async listar(tx: Transacao, organizacaoId: string): Promise<Sistema[]> {
    const linhas = await tx
      .select()
      .from(sistemas)
      .where(eq(sistemas.organizacaoId, organizacaoId))
      .orderBy(desc(sistemas.criadoEm));
    return linhas.map(paraAgregado);
  }
}
