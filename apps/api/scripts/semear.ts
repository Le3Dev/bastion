import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gerarIdentificador } from '@bastion/dominio-compartilhado';
import {
  criarConexao,
  emContextoDaOrganizacao,
  emContextoDoUsuario,
  semContexto,
  type Transacao,
} from '../src/compartilhado/banco/conexao';
import { Organizacao } from '../src/contas/dominio/Organizacao';
import { Usuario } from '../src/contas/dominio/Usuario';
import { RepositorioDeOrganizacoes } from '../src/contas/infraestrutura/RepositorioDeOrganizacoes';
import { RepositorioDeUsuarios } from '../src/contas/infraestrutura/RepositorioDeUsuarios';
import { gerarHash } from '../src/contas/infraestrutura/senhas';
import { gerarTokenDeVerificacao } from '../src/contas/infraestrutura/tokens';
import { Sistema } from '../src/sistemas/dominio/Sistema';
import { RepositorioDeSistemas } from '../src/sistemas/infraestrutura/RepositorioDeSistemas';

const SENHA = 'bastion-demo-123';
const NOME_DA_ORGANIZACAO = 'Organização Exemplo';
const NOME_DO_SISTEMA = 'Alvo de teste local';
const PESSOAS = [
  { nome: 'Dona Exemplo', email: 'dono@exemplo.com.br', papel: 'DONO' as const },
  { nome: 'Analista Exemplo', email: 'analista@exemplo.com.br', papel: 'ANALISTA' as const },
  { nome: 'Leitor Exemplo', email: 'leitor@exemplo.com.br', papel: 'LEITOR' as const },
];

const organizacoes = new RepositorioDeOrganizacoes();
const usuarios = new RepositorioDeUsuarios();
const sistemas = new RepositorioDeSistemas();

async function garantirUsuario(
  tx: Transacao,
  pessoa: { nome: string; email: string },
  hashDaSenha: string,
): Promise<Usuario> {
  const existente = await usuarios.buscarPorEmail(tx, pessoa.email);
  if (existente) return existente.usuario;
  const usuario = Usuario.criar({ id: gerarIdentificador(), email: pessoa.email, nome: pessoa.nome });
  await usuarios.inserir(tx, usuario, hashDaSenha);
  return usuario;
}

async function principal(): Promise<void> {
  // O papel migrador também obedece ao RLS (FORCE), então o script define o contexto como a API.
  const url = process.env['DATABASE_URL_MIGRACAO'] ?? process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('Defina DATABASE_URL_MIGRACAO (ou DATABASE_URL). Copie .env.example para .env.');
  }
  const conexao = criarConexao(url);
  try {
    const agora = new Date();
    const hashDaSenha = await gerarHash(SENHA);

    // Reaproveita a organização se o semeador já rodou antes (idempotência).
    const dono = PESSOAS[0];
    if (!dono) throw new Error('Lista de pessoas vazia.');
    const existente = await semContexto(conexao.db, (tx) => usuarios.buscarPorEmail(tx, dono.email));
    const vinculo = existente
      ? (
          await emContextoDoUsuario(conexao.db, existente.usuario.id, (tx) =>
            organizacoes.vinculosDoUsuario(tx, existente.usuario.id),
          )
        )[0]
      : undefined;
    const organizacaoId = vinculo?.organizacaoId ?? gerarIdentificador();

    const token = await emContextoDaOrganizacao(conexao.db, organizacaoId, async (tx) => {
      const usuariosDaSemente = new Map<string, Usuario>();
      for (const pessoa of PESSOAS) {
        usuariosDaSemente.set(pessoa.email, await garantirUsuario(tx, pessoa, hashDaSenha));
      }

      let organizacao = await organizacoes.buscarPorId(tx, organizacaoId);
      if (!organizacao) {
        const usuarioDono = usuariosDaSemente.get(dono.email);
        if (!usuarioDono) throw new Error('Usuário dono não encontrado.');
        organizacao = Organizacao.fundar(
          {
            id: organizacaoId,
            nome: NOME_DA_ORGANIZACAO,
            dono: {
              membroId: gerarIdentificador(),
              usuarioId: usuarioDono.id,
              nome: dono.nome,
              email: dono.email,
            },
          },
          agora,
        );
        await organizacoes.inserir(tx, organizacao);
      }

      let mudou = false;
      for (const pessoa of PESSOAS.slice(1)) {
        const usuario = usuariosDaSemente.get(pessoa.email);
        if (!usuario) continue;
        if (organizacao.membroPorUsuario(usuario.id)) continue;
        const convidado = organizacao.convidarMembro(
          { membroId: gerarIdentificador(), email: pessoa.email, papel: pessoa.papel },
          'DONO',
          agora,
        );
        organizacao.aceitarConvite(convidado.id, usuario.id, pessoa.nome, agora);
        mudou = true;
      }
      if (mudou) await organizacoes.salvar(tx, organizacao);

      const existentes = await sistemas.listar(tx, organizacaoId);
      const sistemaExistente = existentes.find((s) => s.nome === NOME_DO_SISTEMA);
      if (sistemaExistente) return sistemaExistente.verificacao.token;

      const sistema = Sistema.cadastrar(
        {
          id: gerarIdentificador(),
          organizacaoId,
          nome: NOME_DO_SISTEMA,
          tipo: 'SITE',
          urlDeHomologacao: 'https://localhost:8443',
          dominioDeProducao: 'producao.exemplo.com.br',
          metodoDeVerificacao: 'ARQUIVO_WELL_KNOWN',
          token: gerarTokenDeVerificacao(),
        },
        agora,
      );
      await sistemas.inserir(tx, sistema);
      return sistema.verificacao.token;
    });

    const arquivo = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'infra',
      'alvo-de-teste',
      'publico',
      '.well-known',
      'bastion-verificacao.txt',
    );
    await mkdir(join(arquivo, '..'), { recursive: true });
    await writeFile(arquivo, token, 'utf8');

    console.log('Dados de exemplo prontos.');
    console.log(`Organização: ${NOME_DA_ORGANIZACAO}`);
    for (const pessoa of PESSOAS) {
      console.log(`  ${pessoa.papel.padEnd(9)} ${pessoa.email}  senha: ${SENHA}`);
    }
    console.log(`Sistema: ${NOME_DO_SISTEMA} (https://localhost:8443)`);
    console.log(`Token de verificação gravado em: ${arquivo}`);
  } finally {
    await conexao.fechar();
  }
}

try {
  await principal();
} catch (erro) {
  console.error(`Falha ao semear o banco: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}
