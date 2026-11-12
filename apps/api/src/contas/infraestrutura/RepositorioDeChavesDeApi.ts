import { and, desc, eq } from 'drizzle-orm';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { chavesDeApi } from '../../compartilhado/banco/esquema';
import { ChaveDeApi } from '../dominio/ChaveDeApi';

/**
 * A tabela é global (sem RLS), pois a autenticação por chave acontece antes do contexto da
 * organização. Por isso toda consulta de negócio filtra explicitamente por `organizacaoId`.
 */
export class RepositorioDeChavesDeApi {
  async inserir(tx: Transacao, chave: ChaveDeApi): Promise<void> {
    await tx.insert(chavesDeApi).values(chave.paraDados());
  }

  async salvar(tx: Transacao, chave: ChaveDeApi): Promise<void> {
    const dados = chave.paraDados();
    await tx
      .update(chavesDeApi)
      .set({ revogadaEm: dados.revogadaEm, ultimoUsoEm: dados.ultimoUsoEm })
      .where(eq(chavesDeApi.id, dados.id));
  }

  async buscarPorId(tx: Transacao, organizacaoId: string, id: string): Promise<ChaveDeApi | null> {
    const [linha] = await tx
      .select()
      .from(chavesDeApi)
      .where(and(eq(chavesDeApi.id, id), eq(chavesDeApi.organizacaoId, organizacaoId)))
      .limit(1);
    return linha ? ChaveDeApi.reconstituir(linha) : null;
  }

  /** Autenticação: a busca é só pelo prefixo; o segredo é conferido depois, em tempo constante. */
  async buscarPorPrefixo(tx: Transacao, prefixo: string): Promise<ChaveDeApi | null> {
    const [linha] = await tx
      .select()
      .from(chavesDeApi)
      .where(eq(chavesDeApi.prefixo, prefixo))
      .limit(1);
    return linha ? ChaveDeApi.reconstituir(linha) : null;
  }

  async listar(tx: Transacao, organizacaoId: string): Promise<ChaveDeApi[]> {
    const linhas = await tx
      .select()
      .from(chavesDeApi)
      .where(eq(chavesDeApi.organizacaoId, organizacaoId))
      .orderBy(desc(chavesDeApi.criadaEm));
    return linhas.map((linha) => ChaveDeApi.reconstituir(linha));
  }
}
