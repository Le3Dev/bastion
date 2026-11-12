import type {
  AchadoResumoDto,
  RelatorioDto,
  RelatorioResumoDto,
  Severidade,
} from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import { estaEmAberto } from '../../achados/dominio/EstadoDoAchado';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao, type Banco, type Transacao } from '../../compartilhado/banco/conexao';
import { naoEncontrado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import type { Armazenamento } from '../../integracoes/armazenamento';
import { MapeamentoDeConformidade } from '../dominio/MapeamentoDeConformidade';
import { Relatorio } from '../dominio/Relatorio';
import { renderizarPdf, type RenderizadorDePdf } from '../infraestrutura/gerador-de-pdf';
import { renderizarHtml, type DetalheDoAchadoNoRelatorio } from '../infraestrutura/modelo-html';
import {
  RepositorioDeRelatorios,
  type LinhaDeRelatorio,
} from '../infraestrutura/RepositorioDeRelatorios';

export interface RelatorioCompleto {
  dto: RelatorioDto;
  detalhes: Record<string, DetalheDoAchadoNoRelatorio>;
}

const ATOR_DO_SISTEMA_NA_AUDITORIA = { tipo: 'SISTEMA', id: null, nome: 'Bastion' } as const;

export const chaveDoPdf = (organizacaoId: string, relatorioId: string): string =>
  `relatorios/${organizacaoId}/${relatorioId}.pdf`;

export class ServicoDeRelatorios {
  constructor(
    private readonly db: Banco,
    private readonly armazenamento: Armazenamento,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly repositorio = new RepositorioDeRelatorios(),
    private readonly renderizadorDePdf: RenderizadorDePdf = renderizarPdf,
  ) {}

  async listar(
    contexto: ContextoDaRequisicao,
    filtro: { avaliacaoId?: string | undefined } = {},
  ): Promise<RelatorioResumoDto[]> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const linhas = await this.repositorio.listar(tx, filtro.avaliacaoId);
      return linhas.map((linha) => ({
        id: linha.id,
        avaliacaoId: linha.avaliacaoId,
        sistemaNome: linha.sistemaNome,
        geradoEm: linha.geradoEm.toISOString(),
        nota: linha.nota,
      }));
    });
  }

  async obter(contexto: ContextoDaRequisicao, id: string): Promise<RelatorioDto> {
    return (await this.obterCompleto(contexto, id)).dto;
  }

  /** Relatório com o texto de cada achado, usado na renderização em HTML e PDF. */
  async obterCompleto(contexto: ContextoDaRequisicao, id: string): Promise<RelatorioCompleto> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const linha = await this.repositorio.buscarPorId(tx, id);
      if (!linha) throw naoEncontrado('Relatório');
      return this.montar(tx, linha);
    });
  }

  async obterHtml(contexto: ContextoDaRequisicao, id: string): Promise<string> {
    const { dto, detalhes } = await this.obterCompleto(contexto, id);
    return renderizarHtml(dto, detalhes);
  }

  /** Devolve o PDF guardado ou, na primeira vez, gera, guarda e devolve. */
  async gerarPdf(contexto: ContextoDaRequisicao, id: string): Promise<Buffer> {
    const existente = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const linha = await this.repositorio.buscarPorId(tx, id);
      if (!linha) throw naoEncontrado('Relatório');
      return linha.chaveDoPdf;
    });
    if (existente) return Buffer.from(await this.armazenamento.obter(existente));

    const { dto, detalhes } = await this.obterCompleto(contexto, id);
    const pdf = Buffer.from(await this.renderizadorDePdf(renderizarHtml(dto, detalhes)));
    const chave = chaveDoPdf(contexto.organizacaoId, id);
    await this.armazenamento.enviar(chave, pdf, 'application/pdf');
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, (tx) =>
      this.repositorio.definirChaveDoPdf(tx, id, chave),
    );
    return pdf;
  }

  // ---- Chamados pelo contexto de avaliações, com a transação dele.

  async gerarParaAvaliacao(
    tx: Transacao,
    entrada: {
      organizacaoId: string;
      avaliacaoId: string;
      sistemaId: string;
      sistemaNome: string;
      notaMinima: number;
    },
  ): Promise<{ relatorioId: string; nota: number }> {
    const existente = await this.repositorio.buscarPorAvaliacao(tx, entrada.avaliacaoId);
    if (existente) return { relatorioId: existente.id, nota: existente.nota };

    const agora = this.relogio.agora();
    const achados = await this.repositorio.achadosDaAvaliacao(tx, entrada.avaliacaoId);
    const relatorio = Relatorio.gerar(
      {
        id: gerarIdentificador(),
        organizacaoId: entrada.organizacaoId,
        avaliacaoId: entrada.avaliacaoId,
        sistemaId: entrada.sistemaId,
        sistemaNome: entrada.sistemaNome,
        notaMinima: entrada.notaMinima,
        achados: achados.map((achado) => ({
          id: achado.id,
          titulo: achado.titulo,
          severidade: achado.severidade,
          estado: achado.estado,
          conformidade: achado.conformidade,
        })),
      },
      agora,
    );
    await this.repositorio.inserir(tx, relatorio);
    await this.auditoria.registrar(tx, {
      organizacaoId: entrada.organizacaoId,
      ator: ATOR_DO_SISTEMA_NA_AUDITORIA,
      acao: 'RELATORIO_GERADO',
      alvo: entrada.sistemaNome,
      detalhe: {
        relatorioId: relatorio.id,
        avaliacaoId: entrada.avaliacaoId,
        nota: relatorio.nota.valor,
        aprovado: relatorio.aprovado,
      },
    });
    await registrarNoOutbox(tx, relatorio.puxarEventos());
    return { relatorioId: relatorio.id, nota: relatorio.nota.valor };
  }

  async idDoRelatorioDaAvaliacao(tx: Transacao, avaliacaoId: string): Promise<string | null> {
    return (await this.repositorio.buscarPorAvaliacao(tx, avaliacaoId))?.id ?? null;
  }

  private async montar(tx: Transacao, linha: LinhaDeRelatorio): Promise<RelatorioCompleto> {
    const achados = await this.repositorio.achadosDaAvaliacao(tx, linha.avaliacaoId);
    const requisicoes = await this.repositorio.contarRequisicoes(tx, linha.avaliacaoId);
    const contagem: Record<Severidade, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 };
    for (const achado of achados) {
      if (estaEmAberto(achado.estado)) contagem[achado.severidade] += 1;
    }
    const conformidade = MapeamentoDeConformidade.agregar(achados).paraDados();
    const nota = linha.nota;
    const dto: RelatorioDto = {
      id: linha.id,
      avaliacaoId: linha.avaliacaoId,
      sistemaId: linha.sistemaId,
      sistemaNome: linha.sistemaNome,
      perfil: linha.perfil,
      geradoEm: linha.geradoEm.toISOString(),
      nota,
      notaMinima: linha.notaMinima,
      aprovado: nota >= linha.notaMinima,
      resumo: linha.resumo,
      escopo: {
        urlDeHomologacao: linha.urlDeHomologacao,
        dominioDeProducao: linha.dominioDeProducao,
        requisicoesPermitidas: requisicoes.permitidas,
        requisicoesBloqueadas: requisicoes.bloqueadas,
      },
      contagemPorSeveridade: contagem,
      conformidade,
      achados: achados.map(
        (achado): AchadoResumoDto => ({
          id: achado.id,
          sistemaId: achado.sistemaId,
          sistemaNome: achado.sistemaNome,
          titulo: achado.titulo,
          tipo: achado.tipo as AchadoResumoDto['tipo'],
          severidade: achado.severidade,
          estado: achado.estado,
          local: achado.local,
          ocorrencias: achado.ocorrencias,
          ultimaVezEm: achado.ultimaVezEm.toISOString(),
        }),
      ),
    };
    const detalhes: Record<string, DetalheDoAchadoNoRelatorio> = {};
    for (const achado of achados) {
      detalhes[achado.id] = {
        descricao: achado.descricao,
        correcaoSugerida: achado.correcaoSugerida,
      };
    }
    return { dto, detalhes };
  }
}
