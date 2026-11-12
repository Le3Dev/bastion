import type { ConsultaDeAuditoria, RegistroDeAuditoriaDto } from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { Transacao } from '../../compartilhado/banco/conexao';
import type { Relogio } from '../../compartilhado/relogio';
import type { Acao } from '../dominio/Acao';
import { Ator, type TipoDeAtor } from '../dominio/Ator';
import { RegistroDeAuditoria } from '../dominio/RegistroDeAuditoria';
import { RepositorioDeAuditoria } from '../infraestrutura/RepositorioDeAuditoria';
import { decodificarCursor, montarPagina } from './paginacao';

export interface EntradaDeAuditoria {
  organizacaoId: string;
  ator: { tipo: TipoDeAtor; id: string | null; nome: string };
  acao: Acao;
  alvo: string;
  detalhe?: Record<string, unknown>;
}

export const paraRegistroDto = (registro: RegistroDeAuditoria): RegistroDeAuditoriaDto => {
  const dados = registro.paraDados();
  const detalhe = JSON.parse(dados.detalhe) as Record<string, unknown>;
  return {
    id: dados.id,
    em: dados.ocorridoEm.toISOString(),
    ator: dados.ator,
    acao: dados.acao,
    alvo: dados.alvo,
    detalhe: Object.keys(detalhe).length === 0 ? null : detalhe,
  };
};

export class ServicoDeAuditoria {
  constructor(
    private readonly relogio: Relogio,
    private readonly repositorio = new RepositorioDeAuditoria(),
  ) {}

  /** Grava na transação do caso de uso: se ele falhar, a auditoria também não fica. */
  async registrar(tx: Transacao, entrada: EntradaDeAuditoria): Promise<void> {
    const registro = RegistroDeAuditoria.registrar(
      {
        id: gerarIdentificador(),
        organizacaoId: entrada.organizacaoId,
        ator: Ator.criar(entrada.ator.tipo, entrada.ator.id, entrada.ator.nome),
        acao: entrada.acao,
        alvo: entrada.alvo,
        detalhe: JSON.stringify(entrada.detalhe ?? {}),
      },
      this.relogio.agora(),
    );
    await this.repositorio.adicionar(tx, registro);
  }

  async listar(
    tx: Transacao,
    organizacaoId: string,
    consulta: ConsultaDeAuditoria,
  ): Promise<{ itens: RegistroDeAuditoriaDto[]; proximaPagina: string | null }> {
    const registros = await this.repositorio.listar(tx, organizacaoId, {
      ator: consulta.ator,
      acao: consulta.acao,
      busca: consulta.busca,
      depoisDe: consulta.pagina ? decodificarCursor(consulta.pagina) : undefined,
      limite: consulta.limite + 1,
    });
    const pagina = montarPagina(registros, consulta.limite, (r) => ({
      em: r.ocorridoEm,
      id: r.id,
    }));
    return { itens: pagina.itens.map(paraRegistroDto), proximaPagina: pagina.proximaPagina };
  }
}
