import type { ChaveDeApiDto, CorpoDeNovaChave, RespostaDeNovaChave } from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco } from '../../compartilhado/banco/conexao';
import { naoEncontrado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { ChaveDeApi } from '../dominio/ChaveDeApi';
import { RepositorioDeChavesDeApi } from '../infraestrutura/RepositorioDeChavesDeApi';
import { gerarChaveDeApi } from '../infraestrutura/tokens';

export const paraChaveDto = (chave: ChaveDeApi): ChaveDeApiDto => {
  const dados = chave.paraDados();
  return {
    id: dados.id,
    nome: dados.nome,
    prefixo: dados.prefixo,
    papel: dados.papel,
    criadaEm: dados.criadaEm.toISOString(),
    ultimoUsoEm: dados.ultimoUsoEm?.toISOString() ?? null,
    revogada: dados.revogadaEm !== null,
  };
};

export class ServicoDeChavesDeApi {
  constructor(
    private readonly db: Banco,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly repositorio = new RepositorioDeChavesDeApi(),
  ) {}

  async listar(contexto: ContextoDaRequisicao): Promise<ChaveDeApiDto[]> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const chaves = await this.repositorio.listar(tx, contexto.organizacaoId);
      return chaves.map(paraChaveDto);
    });
  }

  /** O segredo completo é devolvido uma única vez; no banco fica só o hash SHA-256. */
  async criar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeNovaChave,
  ): Promise<RespostaDeNovaChave> {
    const gerada = gerarChaveDeApi();
    const chave = ChaveDeApi.criar(
      {
        id: gerarIdentificador(),
        organizacaoId: contexto.organizacaoId,
        nome: corpo.nome,
        papel: corpo.papel,
        prefixo: gerada.prefixo,
        hashDoSegredo: gerada.hashDoSegredo,
      },
      this.relogio.agora(),
    );
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      await this.repositorio.inserir(tx, chave);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'CHAVE_DE_API_CRIADA',
        alvo: chave.nome,
        detalhe: { chaveId: chave.id, prefixo: chave.prefixo, papel: chave.papel },
      });
      await registrarNoOutbox(tx, chave.puxarEventos());
      return { chave: paraChaveDto(chave), segredo: gerada.valorCompleto };
    });
  }

  async revogar(contexto: ContextoDaRequisicao, chaveId: string): Promise<void> {
    const agora = this.relogio.agora();
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const chave = await this.repositorio.buscarPorId(tx, contexto.organizacaoId, chaveId);
      if (!chave) throw naoEncontrado('Chave de API');
      chave.revogar(agora);
      await this.repositorio.salvar(tx, chave);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'CHAVE_DE_API_REVOGADA',
        alvo: chave.nome,
        detalhe: { chaveId: chave.id },
      });
      await registrarNoOutbox(tx, chave.puxarEventos());
    });
  }
}
