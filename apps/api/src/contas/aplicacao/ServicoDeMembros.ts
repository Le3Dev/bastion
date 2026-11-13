import type {
  CorpoDeAceiteDeConvite,
  CorpoDeAlteracaoDePapel,
  CorpoDeConvite,
  MembroDto,
  RespostaDeConvite,
} from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import {
  ehViolacaoDeUnicidade,
  emContextoDaOrganizacao,
  type Banco,
  type Transacao,
} from '../../compartilhado/banco/conexao';
import type { Config } from '../../compartilhado/config';
import { ErroDeAplicacao, conflito, naoEncontrado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import { montarEmailDeConvite, type ServicoDeEmail } from '../../compartilhado/email/email';
import type { Relogio } from '../../compartilhado/relogio';
import { PoliticaDeLimitesDoPlano } from '../dominio/PoliticaDeLimitesDoPlano';
import type { Membro } from '../dominio/Membro';
import type { Organizacao } from '../dominio/Organizacao';
import { Usuario } from '../dominio/Usuario';
import { RepositorioDeOrganizacoes } from '../infraestrutura/RepositorioDeOrganizacoes';
import { RepositorioDeSessoes } from '../infraestrutura/RepositorioDeSessoes';
import { RepositorioDeUsuarios } from '../infraestrutura/RepositorioDeUsuarios';
import { conferir, gerarHash } from '../infraestrutura/senhas';
import { gerarTokenDeConvite, separarTokenDeConvite } from '../infraestrutura/tokens';
import { iniciarSessao } from './iniciarSessao';
import type { SessaoIniciada } from './ServicoDeContas';

export const paraMembroDto = (membro: Membro): MembroDto => ({
  id: membro.id,
  nome: membro.nome,
  email: membro.email.valor,
  papel: membro.papel,
  estado: membro.estado,
  desde: membro.desde.toISOString(),
});

const conviteInvalido = (): ErroDeAplicacao =>
  new ErroDeAplicacao(400, 'CONVITE_INVALIDO', 'Convite inválido ou já utilizado.');

export class ServicoDeMembros {
  constructor(
    private readonly db: Banco,
    private readonly config: Config,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly email: ServicoDeEmail,
    private readonly organizacoes = new RepositorioDeOrganizacoes(),
    private readonly usuarios = new RepositorioDeUsuarios(),
    private readonly sessoes = new RepositorioDeSessoes(),
  ) {}

  async listar(contexto: ContextoDaRequisicao): Promise<MembroDto[]> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const organizacao = await this.exigirOrganizacao(tx, contexto.organizacaoId);
      return organizacao.listarMembros().map(paraMembroDto);
    });
  }

  /** Devolve o token do convite uma única vez; no banco fica só o hash. */
  async convidar(
    contexto: ContextoDaRequisicao,
    corpo: CorpoDeConvite,
  ): Promise<RespostaDeConvite> {
    const agora = this.relogio.agora();
    const token = gerarTokenDeConvite(contexto.organizacaoId);
    const separado = separarTokenDeConvite(token);
    if (!separado) throw new Error('Falha ao gerar o token do convite.');
    const convite = await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      PoliticaDeLimitesDoPlano.exigirPodeConvidarMembro(
        await this.organizacoes.contarMembros(tx, contexto.organizacaoId),
      );
      const organizacao = await this.exigirOrganizacao(tx, contexto.organizacaoId);
      const membro = organizacao.convidarMembro(
        { membroId: gerarIdentificador(), email: corpo.email, papel: corpo.papel },
        contexto.papel,
        agora,
      );
      await this.organizacoes.salvar(tx, organizacao, new Map([[membro.id, separado.hash]]));
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'MEMBRO_CONVIDADO',
        alvo: membro.email.valor,
        detalhe: { membroId: membro.id, papel: membro.papel },
      });
      await registrarNoOutbox(tx, organizacao.puxarEventos());
      return { resposta: { membro: paraMembroDto(membro), tokenDoConvite: token }, nomeDaOrganizacao: organizacao.nome };
    });
    await this.enviarEmailDeConvite(convite.resposta, convite.nomeDaOrganizacao, token);
    return convite.resposta;
  }

  /** Melhor esforço, só depois do commit: falha no envio nunca derruba o convite (o token segue na resposta). */
  private async enviarEmailDeConvite(
    resposta: RespostaDeConvite,
    nomeDaOrganizacao: string,
    token: string,
  ): Promise<void> {
    try {
      const linkDoConvite = `${this.config.origemDaWeb}/convite?token=${token}`;
      const mensagem = montarEmailDeConvite({
        nomeDaOrganizacao,
        papel: resposta.membro.papel,
        linkDoConvite,
      });
      await this.email.enviar({ para: resposta.membro.email, ...mensagem });
    } catch (erro) {
      console.error('Falha ao enviar o e-mail do convite.', erro);
    }
  }

  /** Aceita o convite: cria o usuário se ele não existir e já inicia a sessão. */
  async aceitarConvite(corpo: CorpoDeAceiteDeConvite): Promise<SessaoIniciada> {
    const separado = separarTokenDeConvite(corpo.token);
    if (!separado) throw conviteInvalido();
    const agora = this.relogio.agora();

    try {
      return await emContextoDaOrganizacao(this.db, separado.organizacaoId, async (tx) => {
        const vinculo = await this.organizacoes.buscarMembroPorHashDeConvite(tx, separado.hash);
        if (!vinculo) throw conviteInvalido();
        const organizacao = await this.exigirOrganizacao(tx, separado.organizacaoId);
        const convidado = organizacao.membroPorId(vinculo.membroId);
        if (!convidado) throw conviteInvalido();

        let usuario: Usuario;
        const existente = await this.usuarios.buscarPorEmail(tx, convidado.email.valor);
        if (existente) {
          // Quem já tem conta prova a identidade com a senha dela, em vez de criar outra.
          if (!(await conferir(existente.hashDaSenha, corpo.senha))) {
            throw new ErroDeAplicacao(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');
          }
          usuario = existente.usuario;
        } else {
          usuario = Usuario.criar({
            id: gerarIdentificador(),
            email: convidado.email.valor,
            nome: corpo.nome,
          });
          await this.usuarios.inserir(tx, usuario, await gerarHash(corpo.senha));
        }

        organizacao.aceitarConvite(vinculo.membroId, usuario.id, corpo.nome.trim(), agora);
        await this.organizacoes.salvar(tx, organizacao);
        const token = await iniciarSessao(tx, this.sessoes, this.config, {
          usuarioId: usuario.id,
          organizacaoId: organizacao.id,
          agora,
        });
        const ator = { tipo: 'USUARIO' as const, id: usuario.id, nome: usuario.nome };
        await this.auditoria.registrar(tx, {
          organizacaoId: organizacao.id,
          ator,
          acao: 'CONVITE_ACEITO',
          alvo: usuario.email.valor,
          detalhe: { membroId: vinculo.membroId },
        });
        await this.auditoria.registrar(tx, {
          organizacaoId: organizacao.id,
          ator,
          acao: 'SESSAO_INICIADA',
          alvo: usuario.email.valor,
        });
        await registrarNoOutbox(tx, organizacao.puxarEventos());
        return {
          tokenDaSessao: token,
          resposta: {
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email.valor },
            organizacao: { id: organizacao.id, nome: organizacao.nome },
            papel: organizacao.membroPorId(vinculo.membroId)?.papel ?? convidado.papel,
          },
        };
      });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw conflito('Este convite já foi usado.', 'CONVITE_JA_USADO');
      throw erro;
    }
  }

  async alterarPapel(
    contexto: ContextoDaRequisicao,
    membroId: string,
    corpo: CorpoDeAlteracaoDePapel,
  ): Promise<MembroDto> {
    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const organizacao = await this.exigirOrganizacao(tx, contexto.organizacaoId);
      const anterior = organizacao.membroPorId(membroId)?.papel;
      organizacao.alterarPapel(membroId, corpo.papel, contexto.papel, agora);
      await this.organizacoes.salvar(tx, organizacao);
      const membro = organizacao.membroPorId(membroId);
      if (!membro) throw naoEncontrado('Membro');
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'PAPEL_ALTERADO',
        alvo: membro.email.valor,
        detalhe: { membroId, papelAnterior: anterior ?? null, papelNovo: corpo.papel },
      });
      await registrarNoOutbox(tx, organizacao.puxarEventos());
      return paraMembroDto(membro);
    });
  }

  async remover(contexto: ContextoDaRequisicao, membroId: string): Promise<void> {
    const agora = this.relogio.agora();
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const organizacao = await this.exigirOrganizacao(tx, contexto.organizacaoId);
      const email = organizacao.membroPorId(membroId)?.email.valor ?? '';
      organizacao.removerMembro(membroId, contexto.papel, agora);
      await this.organizacoes.salvar(tx, organizacao);
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'MEMBRO_REMOVIDO',
        alvo: email,
        detalhe: { membroId },
      });
      await registrarNoOutbox(tx, organizacao.puxarEventos());
    });
  }

  private async exigirOrganizacao(tx: Transacao, organizacaoId: string): Promise<Organizacao> {
    const organizacao = await this.organizacoes.buscarPorId(tx, organizacaoId);
    if (!organizacao) throw naoEncontrado('Organização');
    return organizacao;
  }
}
