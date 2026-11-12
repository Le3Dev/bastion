import type { PainelDto, SistemaDto } from '@bastion/contratos';
import type { ServicoDeAchados } from '../../achados/aplicacao/ServicoDeAchados';
import type { ServicoDeAvaliacoes } from '../../avaliacoes/aplicacao/ServicoDeAvaliacoes';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco } from '../../compartilhado/banco/conexao';
import type { ServicoDeSistemas } from '../../sistemas/aplicacao/ServicoDeSistemas';

const LIMITE_DE_AVALIACOES_RECENTES = 5;
const LIMITE_DE_ACHADOS_CRITICOS_E_ALTOS = 10;

/** Média das últimas notas dos sistemas que já foram avaliados; `null` se nenhum foi. */
export const calcularNotaMedia = (sistemas: readonly Pick<SistemaDto, 'ultimaNota'>[]): number | null => {
  const notas = sistemas.flatMap((sistema) => (sistema.ultimaNota === null ? [] : [sistema.ultimaNota]));
  if (notas.length === 0) return null;
  const media = notas.reduce((soma, nota) => soma + nota, 0) / notas.length;
  return Math.round(media * 10) / 10;
};

export class ServicoDePainel {
  constructor(
    private readonly db: Banco,
    private readonly sistemas: ServicoDeSistemas,
    private readonly avaliacoes: ServicoDeAvaliacoes,
    private readonly achados: ServicoDeAchados,
  ) {}

  async obter(contexto: ContextoDaRequisicao): Promise<PainelDto> {
    const sistemas = await this.sistemas.listar(contexto);
    const verificados = sistemas.filter((sistema) => sistema.verificacao.estado === 'VERIFICADO').length;

    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const resumo = await this.avaliacoes.resumoParaOPainel(
        tx,
        contexto.organizacaoId,
        LIMITE_DE_AVALIACOES_RECENTES,
      );
      return {
        notaMedia: calcularNotaMedia(sistemas),
        achadosEmAbertoPorSeveridade: await this.achados.contagemEmAbertoPorSeveridade(tx),
        sistemas: { verificados, pendentes: sistemas.length - verificados },
        avaliacoesEmAndamento: resumo.emAndamento,
        avaliacoesRecentes: resumo.recentes,
        achadosCriticosEAltos: await this.achados.listarCriticosEAltosEmAberto(
          tx,
          LIMITE_DE_ACHADOS_CRITICOS_E_ALTOS,
        ),
      };
    });
  }
}
