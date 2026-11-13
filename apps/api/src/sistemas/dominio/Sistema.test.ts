import { describe, expect, it } from 'vitest';
import { ConectorDeIa } from './ConectorDeIa';
import { CredencialDeTeste } from './CredencialDeTeste';
import { Escopo } from './Escopo';
import { Sistema, type DadosParaCadastrarSistema } from './Sistema';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const AGORA = new Date('2026-01-10T12:00:00Z');

const base = (sobrescrever: Partial<DadosParaCadastrarSistema> = {}): DadosParaCadastrarSistema => ({
  id: 's-1',
  organizacaoId: 'org-1',
  nome: 'Loja (homologação)',
  tipo: 'SITE',
  urlDeHomologacao: 'https://hml.exemplo-loja.net/',
  dominioDeProducao: 'Loja.com.br.',
  metodoDeVerificacao: 'DNS_TXT',
  token: TOKEN,
  ...sobrescrever,
});

const codigoDe = (fn: () => void): unknown => {
  try {
    fn();
  } catch (erro) {
    return (erro as { codigo?: unknown }).codigo;
  }
  return undefined;
};

describe('Sistema', () => {
  it('cadastra, normaliza o domínio e emite SistemaCadastrado', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    expect(sistema.dominioDeProducao).toBe('loja.com.br');
    expect(sistema.hostDeHomologacao).toBe('hml.exemplo-loja.net');
    expect(sistema.verificacao.estado).toBe('PENDENTE');
    expect(sistema.puxarEventos().map((e) => e.tipo)).toEqual(['SistemaCadastrado']);
  });

  it('exige nome', () => {
    expect(codigoDe(() => Sistema.cadastrar(base({ nome: '  ' }), AGORA))).toBe('NOME_OBRIGATORIO');
  });

  it('exige URL https válida', () => {
    expect(codigoDe(() => Sistema.cadastrar(base({ urlDeHomologacao: 'http://hml.x.net' }), AGORA))).toBe(
      'URL_INVALIDA',
    );
    expect(codigoDe(() => Sistema.cadastrar(base({ urlDeHomologacao: 'lixo' }), AGORA))).toBe(
      'URL_INVALIDA',
    );
  });

  it('exige domínio de produção', () => {
    expect(codigoDe(() => Sistema.cadastrar(base({ dominioDeProducao: ' ' }), AGORA))).toBe(
      'DOMINIO_DE_PRODUCAO_OBRIGATORIO',
    );
  });

  it('bloqueia homologação igual ou subdomínio de produção', () => {
    for (const url of ['https://loja.com.br', 'https://hml.loja.com.br/app', 'https://LOJA.com.br:8443']) {
      expect(codigoDe(() => Sistema.cadastrar(base({ urlDeHomologacao: url }), AGORA))).toBe(
        'HOMOLOGACAO_EM_PRODUCAO',
      );
    }
    expect(() => Sistema.cadastrar(base({ urlDeHomologacao: 'https://hml.loja.com.br' }), AGORA)).toThrow(
      'A URL de homologação pertence ao domínio de produção declarado; o Bastion nunca avalia produção.',
    );
  });

  it('não confunde loja.com.br.evil.com com produção', () => {
    expect(() =>
      Sistema.cadastrar(base({ urlDeHomologacao: 'https://loja.com.br.evil.com' }), AGORA),
    ).not.toThrow();
  });

  it('registra sucesso e falha da verificação com eventos', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    sistema.puxarEventos();
    sistema.registrarResultadoDaVerificacao(false, 'TXT não encontrado', AGORA);
    expect(sistema.estaVerificado(AGORA)).toBe(false);
    expect(sistema.verificacao.mensagem).toBe('TXT não encontrado');
    sistema.registrarResultadoDaVerificacao(true, '', AGORA);
    expect(sistema.estaVerificado(AGORA)).toBe(true);
    expect(sistema.puxarEventos().map((e) => e.tipo)).toEqual([
      'VerificacaoDeSistemaFalhou',
      'SistemaVerificado',
    ]);
  });

  it('a verificação expira após 90 dias', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    sistema.registrarResultadoDaVerificacao(true, '', AGORA);
    expect(sistema.estaVerificado(new Date('2026-04-09T12:00:00Z'))).toBe(true);
    expect(sistema.estaVerificado(new Date('2026-04-11T12:00:00Z'))).toBe(false);
  });

  it('trocar o método volta a verificação para pendente', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    sistema.registrarResultadoDaVerificacao(true, '', AGORA);
    sistema.trocarMetodoDeVerificacao('CABECALHO_HTTP', 'f'.repeat(32));
    expect(sistema.verificacao.metodo).toBe('CABECALHO_HTTP');
    expect(sistema.estaVerificado(AGORA)).toBe(false);
  });

  it('monta o escopo com 5 req/s e produção bloqueada', () => {
    const escopo = Sistema.cadastrar(base(), AGORA).escopo();
    expect(escopo.paraDados()).toEqual({
      hostsPermitidos: ['hml.exemplo-loja.net'],
      dominiosBloqueados: ['loja.com.br'],
      requisicoesPorSegundo: 5,
    });
    expect(escopo).toBeInstanceOf(Escopo);
  });

  it('valida a última nota (inteiro de 0 a 100)', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    sistema.atualizarUltimaNota(87);
    expect(sistema.ultimaNota).toBe(87);
    for (const invalida of [-1, 101, 50.5, Number.NaN]) {
      expect(codigoDe(() => sistema.atualizarUltimaNota(invalida))).toBe('NOTA_INVALIDA');
    }
  });

  it('arquiva o sistema, emite evento, impede nova avaliação e rejeita arquivar de novo', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    sistema.puxarEventos();
    expect(sistema.estaArquivado).toBe(false);
    sistema.arquivar(AGORA);
    expect(sistema.estaArquivado).toBe(true);
    expect(sistema.puxarEventos().map((e) => e.tipo)).toEqual(['SistemaArquivado']);
    expect(sistema.podeAvaliarComPerfil('PASSIVO', AGORA)).toEqual({
      ok: false,
      motivo: 'Sistema arquivado.',
    });
    expect(codigoDe(() => sistema.arquivar(AGORA))).toBe('JA_ARQUIVADO');
    expect(Sistema.reconstituir(sistema.paraDados()).arquivadoEm).toEqual(AGORA);
  });

  it('guarda credencial de teste e conector de IA, e reconstitui', () => {
    const sistema = Sistema.cadastrar(base({ tipo: 'APP_COM_IA' }), AGORA);
    sistema.definirCredencialDeTeste(
      CredencialDeTeste.criar({
        modo: 'FORMULARIO',
        urlDeLogin: 'https://hml.exemplo-loja.net/login',
        campoUsuario: 'email',
        campoSenha: 'senha',
        indicadorDeSucesso: '/painel',
        segredoUsuarioCifrado: 'cifrado-u',
        segredoSenhaCifrado: 'cifrado-s',
      }),
    );
    sistema.definirConectorDeIa(
      ConectorDeIa.criar({
        url: 'https://hml.exemplo-loja.net/chat',
        modeloDoCorpo: '{"mensagem":"{{mensagem}}"}',
        caminhoDaResposta: 'resposta.texto',
        frasesSigilosas: ['segredo'],
        cabecalhosCifrados: null,
      }),
    );
    const copia = Sistema.reconstituir(sistema.paraDados());
    expect(copia.paraDados()).toEqual(sistema.paraDados());
    expect(JSON.stringify(copia.credencialDeTeste)).not.toContain('cifrado');
    sistema.removerCredencialDeTeste();
    sistema.removerConectorDeIa();
    expect(sistema.credencialDeTeste).toBeNull();
    expect(sistema.conectorDeIa).toBeNull();
  });

  it('rejeita conector sem o marcador {{mensagem}}', () => {
    expect(
      codigoDe(() =>
        ConectorDeIa.criar({
          url: 'https://x.net/chat',
          modeloDoCorpo: '{}',
          caminhoDaResposta: 'r',
          frasesSigilosas: [],
          cabecalhosCifrados: null,
        }),
      ),
    ).toBe('CONECTOR_SEM_MARCADOR');
  });

  it('podeAvaliarComPerfil exige verificação e, para IA, tipo e conector', () => {
    const site = Sistema.cadastrar(base(), AGORA);
    expect(site.podeAvaliarComPerfil('PADRAO', AGORA).ok).toBe(false);
    site.registrarResultadoDaVerificacao(true, '', AGORA);
    expect(site.podeAvaliarComPerfil('PADRAO', AGORA).ok).toBe(true);
    expect(site.podeAvaliarComPerfil('IA', AGORA).ok).toBe(false);

    const app = Sistema.cadastrar(base({ tipo: 'APP_COM_IA' }), AGORA);
    app.registrarResultadoDaVerificacao(true, '', AGORA);
    expect(app.podeAvaliarComPerfil('IA', AGORA).motivo).toContain('conector');
    app.definirConectorDeIa(
      ConectorDeIa.criar({
        url: 'https://x.net/chat',
        modeloDoCorpo: '{{mensagem}}',
        caminhoDaResposta: 'r',
        frasesSigilosas: [],
        cabecalhosCifrados: null,
      }),
    );
    expect(app.podeAvaliarComPerfil('IA', AGORA).ok).toBe(true);
  });

  it('reconstitui a partir dos dados', () => {
    const sistema = Sistema.cadastrar(base(), AGORA);
    sistema.registrarResultadoDaVerificacao(true, '', AGORA);
    const copia = Sistema.reconstituir(sistema.paraDados());
    expect(copia.paraDados()).toEqual(sistema.paraDados());
    expect(copia.puxarEventos()).toEqual([]);
  });
});
