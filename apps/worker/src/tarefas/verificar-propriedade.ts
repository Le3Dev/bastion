import { TarefaVerificarPropriedade, type ResultadoDaVerificacao } from '@bastion/contratos';
import { normalizarHost } from '@bastion/dominio-compartilhado';
import type { ClienteHttp } from '../guardiao-de-escopo/cliente-http';

export const PREFIXO_DO_REGISTRO_DNS = '_bastion-verificacao.';
export const CAMINHO_WELL_KNOWN = '/.well-known/bastion-verificacao.txt';
export const CABECALHO_DE_VERIFICACAO = 'x-bastion-verificacao';

export interface DependenciasDoVerificador {
  clienteHttp: Pick<ClienteHttp, 'requisitar'>;
  /** Como `dns.promises.resolveTxt`: cada registro vem em pedaços. */
  resolverTxt: (nome: string) => Promise<string[][]>;
}

export interface VerificadorDePropriedade {
  verificar(tarefa: unknown): Promise<ResultadoDaVerificacao>;
}

const falha = (mensagem: string): ResultadoDaVerificacao => ({ verificado: false, mensagem });
const sucesso = (mensagem: string): ResultadoDaVerificacao => ({ verificado: true, mensagem });

function codigoDoErro(erro: unknown): string | null {
  return typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string'
    ? erro.code
    : null;
}

export function criarVerificadorDePropriedade(deps: DependenciasDoVerificador): VerificadorDePropriedade {
  async function verificarDns(host: string, token: string): Promise<ResultadoDaVerificacao> {
    const nome = `${PREFIXO_DO_REGISTRO_DNS}${host}`;
    let registros: string[][];
    try {
      registros = await deps.resolverTxt(nome);
    } catch (erro) {
      const codigo = codigoDoErro(erro);
      if (codigo === 'ENOTFOUND' || codigo === 'ENODATA') {
        return falha(`Registro TXT não encontrado em ${nome}.`);
      }
      return falha(`Não foi possível consultar o DNS de ${nome} (${codigo ?? 'erro desconhecido'}).`);
    }
    const esperado = `bastion-verificacao=${token}`;
    const valores = registros.map((pedacos) => pedacos.join('').trim());
    if (valores.length === 0) return falha(`Registro TXT não encontrado em ${nome}.`);
    if (valores.includes(esperado)) return sucesso(`Propriedade confirmada pelo registro TXT em ${nome}.`);
    return falha(`Registro TXT encontrado em ${nome}, mas nenhum valor confere com o token.`);
  }

  async function verificarArquivo(url: URL, host: string, token: string): Promise<ResultadoDaVerificacao> {
    const alvo = `https://${url.host}${CAMINHO_WELL_KNOWN}`;
    const resposta = await deps.clienteHttp.requisitar({
      url: alvo,
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: { hostsPermitidos: [host], dominiosBloqueados: [] },
    });
    if (resposta.status === 404) return falha(`Arquivo não encontrado em ${alvo} (HTTP 404).`);
    if (resposta.status < 200 || resposta.status >= 300) {
      return falha(`O servidor respondeu HTTP ${resposta.status} ao buscar ${alvo}.`);
    }
    if (resposta.trechoDoCorpo.trim() !== token) {
      return falha('Arquivo encontrado, mas o conteúdo não confere com o token.');
    }
    return sucesso(`Propriedade confirmada pelo arquivo ${alvo}.`);
  }

  async function verificarCabecalho(url: URL, host: string, token: string): Promise<ResultadoDaVerificacao> {
    const resposta = await deps.clienteHttp.requisitar({
      url: url.toString(),
      metodo: 'GET',
      perfil: 'PASSIVO',
      escopo: { hostsPermitidos: [host], dominiosBloqueados: [] },
    });
    const bruto = resposta.cabecalhos[CABECALHO_DE_VERIFICACAO];
    const valor = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim();
    if (valor === undefined) {
      return falha(`O cabeçalho ${CABECALHO_DE_VERIFICACAO} não veio na resposta de ${url.toString()}.`);
    }
    if (valor !== token) return falha('Cabeçalho encontrado, mas o valor não confere com o token.');
    return sucesso(`Propriedade confirmada pelo cabeçalho ${CABECALHO_DE_VERIFICACAO}.`);
  }

  async function verificar(tarefaBruta: unknown): Promise<ResultadoDaVerificacao> {
    const analise = TarefaVerificarPropriedade.safeParse(tarefaBruta);
    if (!analise.success) return falha('Tarefa de verificação inválida.');
    const tarefa = analise.data;

    let url: URL;
    try {
      url = new URL(tarefa.urlDeHomologacao);
    } catch {
      return falha('A URL de homologação é inválida.');
    }
    const host = normalizarHost(url.hostname);

    try {
      switch (tarefa.metodo) {
        case 'DNS_TXT':
          return await verificarDns(host, tarefa.token);
        case 'ARQUIVO_WELL_KNOWN':
          return await verificarArquivo(url, host, tarefa.token);
        case 'CABECALHO_HTTP':
          return await verificarCabecalho(url, host, tarefa.token);
      }
    } catch (erro) {
      const motivo = erro instanceof Error && erro.message !== '' ? erro.message : 'erro desconhecido';
      return falha(`Não foi possível verificar a propriedade: ${motivo}`);
    }
  }

  return { verificar };
}
