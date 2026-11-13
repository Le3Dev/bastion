import type { PlanoDto } from '@bastion/contratos';
import { and, eq, gte, lt } from 'drizzle-orm';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco } from '../../compartilhado/banco/conexao';
import { avaliacoes } from '../../compartilhado/banco/esquema';
import type { Relogio } from '../../compartilhado/relogio';
import { LIMITES_DO_PLANO } from '../dominio/PoliticaDeLimitesDoPlano';
import { RepositorioDeSistemas } from '../../sistemas/infraestrutura/RepositorioDeSistemas';
import { RepositorioDeOrganizacoes } from '../infraestrutura/RepositorioDeOrganizacoes';

/** Plano único do MVP: "Profissional". */
export const PLANO_PROFISSIONAL = {
  nome: 'Profissional',
  limites: LIMITES_DO_PLANO,
} as const;

export class ServicoDePlano {
  constructor(
    private readonly db: Banco,
    private readonly relogio: Relogio,
    private readonly sistemas = new RepositorioDeSistemas(),
    private readonly organizacoes = new RepositorioDeOrganizacoes(),
  ) {}

  async obter(contexto: ContextoDaRequisicao): Promise<PlanoDto> {
    const agora = this.relogio.agora();
    const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicioDoProximoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const avaliacoesDoMes = await tx
        .select({ id: avaliacoes.id })
        .from(avaliacoes)
        .where(
          and(
            eq(avaliacoes.organizacaoId, contexto.organizacaoId),
            gte(avaliacoes.solicitadaEm, inicioDoMes),
            lt(avaliacoes.solicitadaEm, inicioDoProximoMes),
          ),
        );
      return {
        nome: PLANO_PROFISSIONAL.nome,
        limites: { ...PLANO_PROFISSIONAL.limites },
        uso: {
          sistemas: await this.sistemas.contarAtivos(tx, contexto.organizacaoId),
          avaliacoesNoMes: avaliacoesDoMes.length,
          membros: await this.organizacoes.contarMembros(tx, contexto.organizacaoId),
        },
      };
    });
  }
}
