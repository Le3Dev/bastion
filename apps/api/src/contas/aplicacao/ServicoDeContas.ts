import type { CorpoDeCadastroDeOrganizacao, CorpoDeEntrada, RespostaDeSessao } from '@bastion/contratos';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import type { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import {
  ehViolacaoDeUnicidade,
  emContextoDaOrganizacao,
  emContextoDoUsuario,
  semContexto,
  type Banco,
} from '../../compartilhado/banco/conexao';
import type { Config } from '../../compartilhado/config';
import { ErroDeAplicacao, conflito, naoEncontrado } from '../../compartilhado/erros';
import { registrarNoOutbox } from '../../compartilhado/outbox/outbox';
import type { Relogio } from '../../compartilhado/relogio';
import { Organizacao } from '../dominio/Organizacao';
import { Usuario } from '../dominio/Usuario';
import { RepositorioDeOrganizacoes } from '../infraestrutura/RepositorioDeOrganizacoes';
import { RepositorioDeSessoes } from '../infraestrutura/RepositorioDeSessoes';
import { RepositorioDeUsuarios } from '../infraestrutura/RepositorioDeUsuarios';
import { conferir, gerarHash } from '../infraestrutura/senhas';
import { hashSha256 } from '../infraestrutura/tokens';
import { iniciarSessao } from './iniciarSessao';

export interface SessaoIniciada {
  resposta: RespostaDeSessao;
  /** Valor para o cookie `bastion_sessao`; nunca vai no corpo da resposta. */
  tokenDaSessao: string;
}

const credenciaisInvalidas = (): ErroDeAplicacao =>
  new ErroDeAplicacao(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');

let hashDeReferencia: Promise<string> | undefined;
/** Hash descartável para gastar o mesmo tempo quando o e-mail não existe (evita enumeração). */
const obterHashDeReferencia = (): Promise<string> =>
  (hashDeReferencia ??= gerarHash('bastion-hash-de-referencia'));

export class ServicoDeContas {
  constructor(
    private readonly db: Banco,
    private readonly config: Config,
    private readonly relogio: Relogio,
    private readonly auditoria: ServicoDeAuditoria,
    private readonly organizacoes = new RepositorioDeOrganizacoes(),
    private readonly usuarios = new RepositorioDeUsuarios(),
    private readonly sessoes = new RepositorioDeSessoes(),
  ) {}

  async cadastrarOrganizacao(corpo: CorpoDeCadastroDeOrganizacao): Promise<SessaoIniciada> {
    const agora = this.relogio.agora();
    const organizacaoId = gerarIdentificador();
    const usuario = Usuario.criar({
      id: gerarIdentificador(),
      email: corpo.email,
      nome: corpo.nome,
    });
    const hashDaSenha = await gerarHash(corpo.senha);

    try {
      // O RLS exige o contexto ANTES de inserir a organização (id = contexto).
      return await emContextoDaOrganizacao(this.db, organizacaoId, async (tx) => {
        if (await this.usuarios.buscarPorEmail(tx, usuario.email.valor)) {
          throw conflito('Este e-mail já tem conta.', 'EMAIL_JA_CADASTRADO');
        }
        const organizacao = Organizacao.fundar(
          {
            id: organizacaoId,
            nome: corpo.nomeDaOrganizacao,
            dono: {
              membroId: gerarIdentificador(),
              usuarioId: usuario.id,
              nome: usuario.nome,
              email: usuario.email.valor,
            },
          },
          agora,
        );
        await this.usuarios.inserir(tx, usuario, hashDaSenha);
        await this.organizacoes.inserir(tx, organizacao);
        const token = await iniciarSessao(tx, this.sessoes, this.config, {
          usuarioId: usuario.id,
          organizacaoId,
          agora,
        });
        const ator = { tipo: 'USUARIO' as const, id: usuario.id, nome: usuario.nome };
        await this.auditoria.registrar(tx, {
          organizacaoId,
          ator,
          acao: 'ORGANIZACAO_CRIADA',
          alvo: organizacao.nome,
          detalhe: { organizacaoId },
        });
        await this.auditoria.registrar(tx, {
          organizacaoId,
          ator,
          acao: 'SESSAO_INICIADA',
          alvo: usuario.email.valor,
        });
        await registrarNoOutbox(tx, organizacao.puxarEventos());
        return {
          tokenDaSessao: token,
          resposta: {
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email.valor },
            organizacao: { id: organizacaoId, nome: organizacao.nome },
            papel: 'DONO' as const,
          },
        };
      });
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw conflito('Este e-mail já tem conta.', 'EMAIL_JA_CADASTRADO');
      throw erro;
    }
  }

  async entrar(corpo: CorpoDeEntrada): Promise<SessaoIniciada> {
    const email = corpo.email.trim().toLowerCase();
    const encontrado = await semContexto(this.db, (tx) => this.usuarios.buscarPorEmail(tx, email));
    const senhaConfere = await conferir(
      encontrado?.hashDaSenha ?? (await obterHashDeReferencia()),
      corpo.senha,
    );
    if (!encontrado || !senhaConfere) throw credenciaisInvalidas();

    const { usuario } = encontrado;
    const vinculos = await emContextoDoUsuario(this.db, usuario.id, (tx) =>
      this.organizacoes.vinculosDoUsuario(tx, usuario.id),
    );
    const vinculo = vinculos[0];
    if (!vinculo) {
      throw new ErroDeAplicacao(
        403,
        'SEM_ORGANIZACAO',
        'Este usuário não pertence a nenhuma organização ativa.',
      );
    }

    const agora = this.relogio.agora();
    return emContextoDaOrganizacao(this.db, vinculo.organizacaoId, async (tx) => {
      const organizacao = await this.organizacoes.buscarPorId(tx, vinculo.organizacaoId);
      if (!organizacao) throw naoEncontrado('Organização');
      const token = await iniciarSessao(tx, this.sessoes, this.config, {
        usuarioId: usuario.id,
        organizacaoId: vinculo.organizacaoId,
        agora,
      });
      await this.auditoria.registrar(tx, {
        organizacaoId: vinculo.organizacaoId,
        ator: { tipo: 'USUARIO', id: usuario.id, nome: usuario.nome },
        acao: 'SESSAO_INICIADA',
        alvo: usuario.email.valor,
      });
      return {
        tokenDaSessao: token,
        resposta: {
          usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email.valor },
          organizacao: { id: organizacao.id, nome: organizacao.nome },
          papel: vinculo.papel,
        },
      };
    });
  }

  /** Encerra a sessão do cookie (para chaves de API não há sessão a encerrar). */
  async sair(contexto: ContextoDaRequisicao, tokenDaSessao: string | undefined): Promise<void> {
    if (contexto.ator.tipo !== 'USUARIO' || !tokenDaSessao) return;
    await emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      await this.sessoes.removerPorHash(tx, hashSha256(tokenDaSessao));
      await this.auditoria.registrar(tx, {
        organizacaoId: contexto.organizacaoId,
        ator: contexto.ator,
        acao: 'SESSAO_ENCERRADA',
        alvo: contexto.ator.nome,
      });
    });
  }

  async sessaoAtual(contexto: ContextoDaRequisicao): Promise<RespostaDeSessao> {
    return emContextoDaOrganizacao(this.db, contexto.organizacaoId, async (tx) => {
      const organizacao = await this.organizacoes.buscarPorId(tx, contexto.organizacaoId);
      if (!organizacao) throw naoEncontrado('Organização');
      if (contexto.ator.tipo === 'CHAVE_DE_API') {
        // Chave de API não tem usuário: devolve uma identidade descritiva da própria chave.
        return {
          usuario: {
            id: contexto.ator.id,
            nome: contexto.ator.nome,
            email: 'chave-de-api@bastion.invalid',
          },
          organizacao: { id: organizacao.id, nome: organizacao.nome },
          papel: contexto.papel,
        };
      }
      const encontrado = await this.usuarios.buscarPorId(tx, contexto.ator.id);
      if (!encontrado) throw naoEncontrado('Usuário');
      return {
        usuario: {
          id: encontrado.usuario.id,
          nome: encontrado.usuario.nome,
          email: encontrado.usuario.email.valor,
        },
        organizacao: { id: organizacao.id, nome: organizacao.nome },
        papel: contexto.papel,
      };
    });
  }
}
