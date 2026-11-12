import type { TarefaVerificarPropriedade } from '@bastion/contratos';
import { describe, expect, it, vi } from 'vitest';
import type { RespostaHttp } from '../guardiao-de-escopo/cliente-http';
import { criarVerificadorDePropriedade, type DependenciasDoVerificador } from './verificar-propriedade';

const TOKEN = 'tok-abc123';

const tarefa = (
  metodo: TarefaVerificarPropriedade['metodo'],
  url = 'https://homolog.exemplo.com:8443/app',
): TarefaVerificarPropriedade => ({
  sistemaId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  organizacaoId: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  metodo,
  token: TOKEN,
  urlDeHomologacao: url,
});

const resposta = (status: number, corpo = '', cabecalhos: RespostaHttp['cabecalhos'] = {}): RespostaHttp => ({
  url: 'https://homolog.exemplo.com:8443/',
  status,
  cabecalhos,
  trechoDoCorpo: corpo,
});

function montar(
  http: (url: string) => Promise<RespostaHttp> = () => Promise.resolve(resposta(200)),
  txt: DependenciasDoVerificador['resolverTxt'] = () => Promise.resolve([]),
) {
  const requisitar = vi.fn((pedido: { url: string }) => http(pedido.url));
  const resolverTxt = vi.fn(txt);
  return {
    verificador: criarVerificadorDePropriedade({ clienteHttp: { requisitar }, resolverTxt }),
    requisitar,
    resolverTxt,
  };
}

describe('verificador de propriedade', () => {
  describe('DNS_TXT', () => {
    it('confirma quando um registro confere (mesmo em pedaços)', async () => {
      const { verificador, resolverTxt } = montar(undefined, () =>
        Promise.resolve([['outro=1'], ['bastion-verificacao=', TOKEN]]),
      );
      const resultado = await verificador.verificar(tarefa('DNS_TXT'));
      expect(resultado.verificado).toBe(true);
      expect(resolverTxt).toHaveBeenCalledWith('_bastion-verificacao.homolog.exemplo.com');
    });

    it('falha quando o registro não existe', async () => {
      const { verificador } = montar(undefined, () =>
        Promise.reject(Object.assign(new Error('x'), { code: 'ENODATA' })),
      );
      expect(await verificador.verificar(tarefa('DNS_TXT'))).toEqual({
        verificado: false,
        mensagem: 'Registro TXT não encontrado em _bastion-verificacao.homolog.exemplo.com.',
      });
    });

    it('falha quando nenhum valor confere', async () => {
      const { verificador } = montar(undefined, () => Promise.resolve([['bastion-verificacao=errado']]));
      const resultado = await verificador.verificar(tarefa('DNS_TXT'));
      expect(resultado.verificado).toBe(false);
      expect(resultado.mensagem).toContain('nenhum valor confere');
    });

    it('explica falha do DNS', async () => {
      const { verificador } = montar(undefined, () =>
        Promise.reject(Object.assign(new Error('x'), { code: 'ETIMEOUT' })),
      );
      const resultado = await verificador.verificar(tarefa('DNS_TXT'));
      expect(resultado.mensagem).toContain('ETIMEOUT');
    });
  });

  describe('ARQUIVO_WELL_KNOWN', () => {
    it('confirma com o conteúdo igual ao token (sem espaços nas pontas) preservando a porta', async () => {
      const { verificador, requisitar } = montar(() => Promise.resolve(resposta(200, `  ${TOKEN}\n`)));
      expect((await verificador.verificar(tarefa('ARQUIVO_WELL_KNOWN'))).verificado).toBe(true);
      expect(requisitar).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://homolog.exemplo.com:8443/.well-known/bastion-verificacao.txt',
          metodo: 'GET',
          perfil: 'PASSIVO',
          escopo: { hostsPermitidos: ['homolog.exemplo.com'], dominiosBloqueados: [] },
        }),
      );
    });

    it('falha quando o conteúdo não confere', async () => {
      const { verificador } = montar(() => Promise.resolve(resposta(200, 'outro')));
      expect(await verificador.verificar(tarefa('ARQUIVO_WELL_KNOWN'))).toEqual({
        verificado: false,
        mensagem: 'Arquivo encontrado, mas o conteúdo não confere com o token.',
      });
    });

    it('falha quando o arquivo não existe', async () => {
      const { verificador } = montar(() => Promise.resolve(resposta(404)));
      const resultado = await verificador.verificar(tarefa('ARQUIVO_WELL_KNOWN'));
      expect(resultado.verificado).toBe(false);
      expect(resultado.mensagem).toContain('Arquivo não encontrado');
    });

    it('transforma falha de rede em resultado, sem lançar', async () => {
      const { verificador } = montar(() =>
        Promise.reject(new Error('Não foi possível conectar a homolog.exemplo.com:8443 (ECONNREFUSED).')),
      );
      const resultado = await verificador.verificar(tarefa('ARQUIVO_WELL_KNOWN'));
      expect(resultado.verificado).toBe(false);
      expect(resultado.mensagem).toContain('ECONNREFUSED');
    });
  });

  describe('CABECALHO_HTTP', () => {
    it('confirma quando o cabeçalho confere', async () => {
      const { verificador, requisitar } = montar(() =>
        Promise.resolve(resposta(200, '', { 'x-bastion-verificacao': TOKEN })),
      );
      expect((await verificador.verificar(tarefa('CABECALHO_HTTP'))).verificado).toBe(true);
      expect(requisitar).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://homolog.exemplo.com:8443/app' }),
      );
    });

    it('falha quando o cabeçalho está ausente', async () => {
      const { verificador } = montar();
      const resultado = await verificador.verificar(tarefa('CABECALHO_HTTP'));
      expect(resultado.verificado).toBe(false);
      expect(resultado.mensagem).toContain('x-bastion-verificacao');
    });

    it('falha quando o valor não confere', async () => {
      const { verificador } = montar(() => Promise.resolve(resposta(200, '', { 'x-bastion-verificacao': 'x' })));
      expect(await verificador.verificar(tarefa('CABECALHO_HTTP'))).toEqual({
        verificado: false,
        mensagem: 'Cabeçalho encontrado, mas o valor não confere com o token.',
      });
    });
  });

  it('devolve falha para tarefa inválida', async () => {
    const { verificador } = montar();
    expect((await verificador.verificar({ metodo: 'DNS_TXT' })).verificado).toBe(false);
  });
});
