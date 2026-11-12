import type { Transacao } from '../../compartilhado/banco/conexao';
import type { Config } from '../../compartilhado/config';
import type { RepositorioDeSessoes } from '../infraestrutura/RepositorioDeSessoes';
import { gerarTokenOpaco, hashSha256 } from '../infraestrutura/tokens';

/** Cria a sessão no banco (só o hash do token) e devolve o token para o cookie. */
export const iniciarSessao = async (
  tx: Transacao,
  sessoes: RepositorioDeSessoes,
  config: Config,
  dados: { usuarioId: string; organizacaoId: string; agora: Date },
): Promise<string> => {
  const token = gerarTokenOpaco();
  await sessoes.criar(tx, {
    hashDoToken: hashSha256(token),
    usuarioId: dados.usuarioId,
    organizacaoId: dados.organizacaoId,
    criadaEm: dados.agora,
    expiraEm: new Date(dados.agora.getTime() + config.sessaoDuracaoHoras * 3_600_000),
  });
  return token;
};
