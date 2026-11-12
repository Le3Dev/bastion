import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  exigirPermissao as exigirPermissaoDoPapel,
  type Permissao,
} from '../../contas/dominio/Permissoes';
import { RepositorioDeChavesDeApi } from '../../contas/infraestrutura/RepositorioDeChavesDeApi';
import { RepositorioDeOrganizacoes } from '../../contas/infraestrutura/RepositorioDeOrganizacoes';
import { RepositorioDeSessoes } from '../../contas/infraestrutura/RepositorioDeSessoes';
import { RepositorioDeUsuarios } from '../../contas/infraestrutura/RepositorioDeUsuarios';
import {
  hashesIguais,
  hashSha256,
  separarChaveDeApi,
} from '../../contas/infraestrutura/tokens';
import { emContextoDaOrganizacao, semContexto, type Banco } from '../banco/conexao';
import type { Config } from '../config';
import { naoAutenticado } from '../erros';
import type { Relogio } from '../relogio';
import {
  NOME_DO_COOKIE_DE_SESSAO,
  type ContextoDaRequisicao,
} from './contexto';

export interface OpcoesDaAutenticacao {
  db: Banco;
  config: Config;
  relogio: Relogio;
}

const sessoes = new RepositorioDeSessoes();
const chaves = new RepositorioDeChavesDeApi();
const organizacoes = new RepositorioDeOrganizacoes();
const usuarios = new RepositorioDeUsuarios();

const autenticarPorChave = async (
  { db, relogio }: OpcoesDaAutenticacao,
  valor: string,
): Promise<ContextoDaRequisicao | null> => {
  const partes = separarChaveDeApi(valor);
  if (!partes) return null;
  const chave = await semContexto(db, (tx) => chaves.buscarPorPrefixo(tx, partes.prefixo));
  if (!chave || !chave.estaAtiva || !hashesIguais(chave.hashDoSegredo, partes.hash)) return null;
  await semContexto(db, async (tx) => {
    chave.registrarUso(relogio.agora());
    await chaves.salvar(tx, chave);
  });
  return {
    organizacaoId: chave.organizacaoId,
    papel: chave.papel,
    ator: { tipo: 'CHAVE_DE_API', id: chave.id, nome: chave.nome },
    membroId: null,
  };
};

const autenticarPorSessao = async (
  { db, relogio }: OpcoesDaAutenticacao,
  token: string,
): Promise<ContextoDaRequisicao | null> => {
  const hash = hashSha256(token);
  const sessao = await semContexto(db, (tx) => sessoes.buscarPorHash(tx, hash));
  const agora = relogio.agora();
  if (!sessao || sessao.expiraEm.getTime() <= agora.getTime()) return null;
  return emContextoDaOrganizacao(db, sessao.organizacaoId, async (tx) => {
    const organizacao = await organizacoes.buscarPorId(tx, sessao.organizacaoId);
    const membro = organizacao?.membroPorUsuario(sessao.usuarioId);
    if (!membro || membro.estado !== 'ATIVO') return null;
    const usuario = await usuarios.buscarPorId(tx, sessao.usuarioId);
    if (!usuario) return null;
    await sessoes.registrarUso(tx, sessao.id, agora);
    return {
      organizacaoId: sessao.organizacaoId,
      papel: membro.papel,
      ator: { tipo: 'USUARIO', id: sessao.usuarioId, nome: usuario.usuario.nome },
      membroId: membro.id,
    };
  });
};

/**
 * Plugin que resolve `request.contexto` a cada requisição, por chave de API (Bearer) ou por
 * cookie de sessão. Credencial ausente ou inválida deixa o contexto `null`; quem exige
 * autenticação usa `exigirAutenticacao` ou `exigirPermissao`.
 */
export const pluginDeAutenticacao = fp<OpcoesDaAutenticacao>(
  async (app, opcoes) => {
    app.decorateRequest('contexto', null);
    app.addHook('onRequest', async (request) => {
      request.contexto = null;
      const cabecalho = request.headers.authorization;
      if (cabecalho !== undefined) {
        const [esquema, valor] = cabecalho.split(' ');
        if (esquema?.toLowerCase() === 'bearer' && valor) {
          request.contexto = await autenticarPorChave(opcoes, valor);
        }
        return;
      }
      const token = request.cookies[NOME_DO_COOKIE_DE_SESSAO];
      if (token) request.contexto = await autenticarPorSessao(opcoes, token);
    });
  },
  { name: 'bastion-autenticacao', dependencies: ['@fastify/cookie'] },
);

/** `preHandler`: exige uma sessão ou chave de API válida (401 caso contrário). */
export const exigirAutenticacao = async (request: FastifyRequest): Promise<void> => {
  if (!request.contexto) throw naoAutenticado();
};

/** `preHandler`: exige autenticação e a permissão informada (403 se o papel não a tiver). */
export const exigirPermissao =
  (permissao: Permissao) =>
  async (request: FastifyRequest): Promise<void> => {
    if (!request.contexto) throw naoAutenticado();
    exigirPermissaoDoPapel(request.contexto.papel, permissao);
  };

/** Contexto já validado pelo `preHandler`; usado dentro dos handlers. */
export const contextoDe = (request: FastifyRequest): ContextoDaRequisicao => {
  if (!request.contexto) throw naoAutenticado();
  return request.contexto;
};

export const definirCookieDeSessao = (
  reply: FastifyReply,
  token: string,
  config: Config,
): void => {
  reply.setCookie(NOME_DO_COOKIE_DE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.sessaoCookieSeguro,
    path: '/',
    maxAge: Math.floor(config.sessaoDuracaoHoras * 3600),
  });
};

export const limparCookieDeSessao = (reply: FastifyReply, config: Config): void => {
  reply.clearCookie(NOME_DO_COOKIE_DE_SESSAO, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.sessaoCookieSeguro,
    path: '/',
  });
};
