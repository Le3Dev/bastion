import { ErroDeDominio } from '@bastion/dominio-compartilhado';
import type { ServicoDeAchados } from '../../achados/aplicacao/ServicoDeAchados';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { Transacao } from '../../compartilhado/banco/conexao';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { registrarManipuladorDeResultado, type AposOCommit } from '../../integracoes/consumidor-de-resultados';
import type { ServicoDeRelatorios } from '../../relatorios/aplicacao/ServicoDeRelatorios';
import type { ServicoDeSistemas } from '../../sistemas/aplicacao/ServicoDeSistemas';
import { ATOR_SISTEMA, type ServicoDeAvaliacoes } from '../aplicacao/ServicoDeAvaliacoes';
import type { Avaliacao } from '../dominio/Avaliacao';
import { ehEstadoFinalDaAvaliacao } from '../dominio/EstadoDaAvaliacao';
import type { AoVivo } from './ao-vivo';

export interface DependenciasDosManipuladores {
  relogio: Relogio;
  auditoria: ServicoDeAuditoria;
  sistemas: ServicoDeSistemas;
  avaliacoes: ServicoDeAvaliacoes;
  achados: ServicoDeAchados;
  relatorios: ServicoDeRelatorios;
  aoVivo: AoVivo;
  /** Eventos ignorados (estado final, transição inválida): só registro, nunca erro. */
  registrarAviso?: (mensagem: string) => void;
}

type TipoDeTransicao =
  | 'preparacao-iniciada'
  | 'execucao-iniciada'
  | 'etapa-atualizada'
  | 'analise-iniciada';

/**
 * Registra os manipuladores dos eventos que o worker publica na fila `resultados`.
 * Idempotente (o último registro vence). Cada manipulador roda na transação do consumidor, no
 * contexto da organização, e devolve a publicação "ao vivo" para depois do commit.
 */
export const registrarManipuladoresDeResultado = (deps: DependenciasDosManipuladores): void => {
  const { relogio, auditoria, sistemas, avaliacoes, achados, relatorios, aoVivo } = deps;
  const repositorio = avaliacoes.repositorio;
  const avisar = deps.registrarAviso ?? ((mensagem: string) => console.warn(mensagem));

  const publicarDepois =
    (publicar: () => Promise<void>): AposOCommit =>
    async () => {
      try {
        await publicar();
      } catch (erro) {
        avisar(`Não foi possível publicar o acompanhamento ao vivo: ${String(erro)}`);
      }
    };

  /** Carrega a avaliação (travada) ou explica por que o evento deve ser ignorado. */
  const carregarAtiva = async (
    tx: Transacao,
    evento: { tipo: string; organizacaoId: string; avaliacaoId: string },
  ): Promise<Avaliacao | null> => {
    const avaliacao = await repositorio.buscarPorId(tx, evento.organizacaoId, evento.avaliacaoId, true);
    if (!avaliacao) {
      avisar(`Evento ${evento.tipo} ignorado: avaliação ${evento.avaliacaoId} não encontrada.`);
      return null;
    }
    if (ehEstadoFinalDaAvaliacao(avaliacao.estado)) {
      avisar(
        `Evento ${evento.tipo} ignorado: a avaliação ${avaliacao.id} já está em estado final (${avaliacao.estado}).`,
      );
      return null;
    }
    return avaliacao;
  };

  /** Executa uma regra de domínio; transição inválida vira aviso (não repete o job à toa). */
  const aplicar = (
    avaliacao: Avaliacao,
    tipo: string,
    regra: () => void,
  ): boolean => {
    try {
      regra();
      return true;
    } catch (erro) {
      if (erro instanceof ErroDeDominio) {
        avisar(`Evento ${tipo} ignorado para a avaliação ${avaliacao.id}: ${erro.message}`);
        return false;
      }
      throw erro;
    }
  };

  /** Transição de estado ou de etapa: aplica a regra, salva e publica a avaliação atualizada. */
  const transicionar = async (
    tx: Transacao,
    evento: { tipo: TipoDeTransicao; organizacaoId: string; avaliacaoId: string },
    regra: (avaliacao: Avaliacao, agora: Date) => void,
  ): Promise<AposOCommit | void> => {
    const avaliacao = await carregarAtiva(tx, evento);
    if (!avaliacao) return;
    const agora = relogio.agora();
    if (!aplicar(avaliacao, evento.tipo, () => regra(avaliacao, agora))) return;
    await repositorio.salvar(tx, avaliacao);
    const dto = await avaliacoes.montarDto(tx, avaliacao);
    return publicarDepois(() => aoVivo.publicarAoVivo(dto.id, { tipo: 'avaliacao', dados: dto }));
  };

  registrarManipuladorDeResultado('preparacao-iniciada', (evento, tx) =>
    transicionar(tx, evento, (avaliacao, agora) => avaliacao.iniciarPreparacao(agora)),
  );
  registrarManipuladorDeResultado('execucao-iniciada', (evento, tx) =>
    transicionar(tx, evento, (avaliacao, agora) => avaliacao.iniciarExecucao(agora)),
  );
  registrarManipuladorDeResultado('analise-iniciada', (evento, tx) =>
    transicionar(tx, evento, (avaliacao, agora) => avaliacao.iniciarAnalise(agora)),
  );
  registrarManipuladorDeResultado('etapa-atualizada', (evento, tx) =>
    transicionar(tx, evento, (avaliacao) =>
      avaliacao.atualizarEtapa(evento.nome, evento.estado, evento.progresso),
    ),
  );

  registrarManipuladorDeResultado('requisicao-do-guardiao', async (evento, tx) => {
    const avaliacao = await carregarAtiva(tx, evento);
    if (!avaliacao) return;
    const linha = await repositorio.inserirRequisicao(tx, {
      organizacaoId: evento.organizacaoId,
      avaliacaoId: avaliacao.id,
      em: new Date(evento.em),
      metodo: evento.metodo,
      url: evento.url,
      decisao: evento.decisao,
      motivo: evento.motivo,
      status: evento.status,
    });
    if (evento.decisao === 'BLOQUEADA') {
      await auditoria.registrar(tx, {
        organizacaoId: evento.organizacaoId,
        ator: ATOR_SISTEMA,
        acao: 'REQUISICAO_BLOQUEADA_PELO_GUARDIAO',
        alvo: evento.url,
        detalhe: {
          avaliacaoId: avaliacao.id,
          sistemaId: avaliacao.sistemaId,
          metodo: evento.metodo,
          motivo: evento.motivo,
        },
      });
    }
    const dados = {
      id: linha.id,
      em: linha.em.toISOString(),
      metodo: linha.metodo,
      url: linha.url,
      decisao: linha.decisao,
      motivo: linha.motivo,
      status: linha.status,
    };
    return publicarDepois(() => aoVivo.publicarAoVivo(avaliacao.id, { tipo: 'requisicao', dados }));
  });

  registrarManipuladorDeResultado('constatacao', async (evento, tx) => {
    const avaliacao = await carregarAtiva(tx, evento);
    if (!avaliacao) return;
    const achado = await achados.registrarConstatacao(tx, {
      organizacaoId: evento.organizacaoId,
      sistemaId: avaliacao.sistemaId,
      avaliacaoId: avaliacao.id,
      constatacao: evento.constatacao,
    });
    return publicarDepois(() =>
      aoVivo.publicarAoVivo(avaliacao.id, { tipo: 'achado', dados: achado }),
    );
  });

  registrarManipuladorDeResultado('avaliacao-finalizada', async (evento, tx) => {
    const avaliacao = await carregarAtiva(tx, evento);
    if (!avaliacao) return;
    if (avaliacao.estado !== 'ANALISANDO') {
      avisar(
        `Evento avaliacao-finalizada ignorado: a avaliação ${avaliacao.id} está em ${avaliacao.estado}, não em ANALISANDO.`,
      );
      return;
    }
    const agora = relogio.agora();
    const sistema = await sistemas.obterParaAvaliacao(tx, avaliacao.sistemaId);

    const achadoRevalidadoId = avaliacao.achadoRevalidadoId;
    if (achadoRevalidadoId !== null) {
      await achados.concluirRevalidacao(tx, { achadoId: achadoRevalidadoId, avaliacaoId: avaliacao.id });
    }
    const { nota } = await relatorios.gerarParaAvaliacao(tx, {
      organizacaoId: evento.organizacaoId,
      avaliacaoId: avaliacao.id,
      sistemaId: sistema.id,
      sistemaNome: sistema.nome,
      notaMinima: avaliacao.notaMinima,
    });
    avaliacao.concluir(nota, agora);
    sistema.atualizarUltimaNota(nota);
    await sistemas.salvar(tx, sistema);
    await repositorio.salvar(tx, avaliacao);
    await registrarNoOutbox(tx, avaliacao.puxarEventos());
    await auditoria.registrar(tx, {
      organizacaoId: evento.organizacaoId,
      ator: ATOR_SISTEMA,
      acao: 'AVALIACAO_CONCLUIDA',
      alvo: sistema.nome,
      detalhe: {
        avaliacaoId: avaliacao.id,
        sistemaId: sistema.id,
        nota,
        aprovada: nota >= avaliacao.notaMinima,
      },
    });
    const dto = await avaliacoes.montarDto(tx, avaliacao);
    return publicarDepois(() => aoVivo.publicarAoVivo(dto.id, { tipo: 'avaliacao', dados: dto }));
  });

  registrarManipuladorDeResultado('avaliacao-falhou', async (evento, tx) => {
    const avaliacao = await carregarAtiva(tx, evento);
    if (!avaliacao) return;
    const agora = relogio.agora();
    if (!aplicar(avaliacao, 'avaliacao-falhou', () => avaliacao.falhar(evento.motivo, agora))) return;
    await avaliacoes.persistirFalha(tx, avaliacao);
    const dto = await avaliacoes.montarDto(tx, avaliacao);
    return publicarDepois(() => aoVivo.publicarAoVivo(dto.id, { tipo: 'avaliacao', dados: dto }));
  });
};
