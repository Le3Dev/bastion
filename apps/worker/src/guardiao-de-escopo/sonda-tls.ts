import { isIP } from 'node:net';
import { checkServerIdentity, connect, type ConnectionOptions, type PeerCertificate, type TLSSocket } from 'node:tls';
import type { CertificadoColetado, DadosDoTls } from '../modulos/passivo';
import { avaliarHostLiteral, criarLookupSeguro, encontrarBloqueioDeEndereco, type ResolvedorDns } from './dns-seguro';

const TEMPO_DA_CONEXAO_MS = 10_000;
const TEMPO_DA_SONDAGEM_MS = 5_000;
const VERSOES_SONDADAS = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'] as const;

type VersaoTls = (typeof VERSOES_SONDADAS)[number];

export interface OpcoesDaSondaTls {
  host: string;
  porta: number;
  permitirRedesPrivadas: boolean;
  /** Só para testes. */
  resolverDns?: ResolvedorDns;
}

function conectar(opcoes: ConnectionOptions, tempoMs: number): Promise<TLSSocket> {
  return new Promise((resolver, rejeitar) => {
    const socket = connect(opcoes);
    const falhar = (erro: Error): void => {
      socket.destroy();
      rejeitar(erro);
    };
    socket.setTimeout(tempoMs, () => {
      const erro: NodeJS.ErrnoException = new Error('Tempo esgotado na negociação TLS.');
      erro.code = 'ETIMEDOUT';
      falhar(erro);
    });
    socket.once('error', falhar);
    socket.once('secureConnect', () => {
      socket.setTimeout(0);
      socket.removeListener('error', falhar);
      socket.on('error', () => undefined);
      resolver(socket);
    });
  });
}

function formatarNome(nome: object | undefined): string {
  if (nome === undefined) return 'desconhecido';
  const campos = nome as Record<string, unknown>;
  const comum = campos['CN'];
  if (typeof comum === 'string' && comum !== '') return comum;
  const partes = Object.entries(campos)
    .filter((entrada): entrada is [string, string] => typeof entrada[1] === 'string')
    .map(([chave, valor]) => `${chave}=${valor}`);
  return partes.length > 0 ? partes.join(', ') : 'desconhecido';
}

function descreverFalhaDeConexao(erro: unknown, host: string, porta: number): Error {
  const bloqueio = encontrarBloqueioDeEndereco(erro);
  if (bloqueio !== null) {
    return new Error(`Sonda TLS bloqueada pelo Guardião de Escopo: ${bloqueio.motivo}.`);
  }
  const codigo =
    typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string' ? erro.code : null;
  const detalhe = codigo ?? (erro instanceof Error ? erro.message : 'erro desconhecido');
  return new Error(`Não foi possível negociar TLS com ${host}:${porta} (${detalhe}).`);
}

function coletarCertificado(socket: TLSSocket, host: string): CertificadoColetado | null {
  const certificado: PeerCertificate = socket.getPeerCertificate();
  if (!certificado.valid_from || !certificado.valid_to) return null;
  const validoDe = new Date(certificado.valid_from);
  const validoAte = new Date(certificado.valid_to);
  if (Number.isNaN(validoDe.getTime()) || Number.isNaN(validoAte.getTime())) return null;

  const erroDeNome = checkServerIdentity(host, certificado);
  const motivo = socket.authorizationError as unknown;
  return {
    validoDe,
    validoAte,
    emissor: formatarNome(certificado.issuer),
    sujeito: formatarNome(certificado.subject),
    confiavel: socket.authorized,
    nomeConfere: erroDeNome === undefined,
    motivoDaDesconfianca: socket.authorized
      ? null
      : motivo instanceof Error
        ? motivo.message
        : typeof motivo === 'string' && motivo !== ''
          ? motivo
          : 'motivo não informado',
  };
}

/**
 * Coleta os dados de TLS do host: certificado (com confiança e nome) e protocolos aceitos.
 * Passa pela mesma validação de DNS e IP do cliente HTTP.
 */
export async function sondarTls(opcoes: OpcoesDaSondaTls): Promise<DadosDoTls> {
  const { host, porta } = opcoes;
  const enderecos = { permitirRedesPrivadas: opcoes.permitirRedesPrivadas };
  const bloqueioLiteral = avaliarHostLiteral(host, enderecos);
  if (bloqueioLiteral !== null && !bloqueioLiteral.permitido) {
    throw new Error(`Sonda TLS bloqueada pelo Guardião de Escopo: ${bloqueioLiteral.motivo}.`);
  }

  const lookup = criarLookupSeguro({
    ...enderecos,
    ...(opcoes.resolverDns ? { resolver: opcoes.resolverDns } : {}),
  });
  const base: ConnectionOptions = {
    host,
    port: porta,
    lookup,
    // Certificado ruim não impede a coleta; a confiança é lida de `authorized` e avaliada à parte.
    rejectUnauthorized: false,
    ...(isIP(host.replace(/^\[|\]$/g, '')) === 0 ? { servername: host } : {}),
  };

  let certificado: CertificadoColetado | null;
  const protocolosAceitos: string[] = [];
  let principal: TLSSocket | null = null;
  try {
    principal = await conectar(base, TEMPO_DA_CONEXAO_MS);
    certificado = coletarCertificado(principal, host);
  } catch (erro) {
    throw descreverFalhaDeConexao(erro, host, porta);
  } finally {
    principal?.destroy();
  }

  for (const versao of VERSOES_SONDADAS) {
    if (await versaoAceita(base, versao)) protocolosAceitos.push(versao);
  }

  return { host, protocolosAceitos, certificado };
}

async function versaoAceita(base: ConnectionOptions, versao: VersaoTls): Promise<boolean> {
  let socket: TLSSocket | null = null;
  try {
    // SECLEVEL=0 faz o OpenSSL aceitar sondar versões e cifras antigas.
    socket = await conectar(
      { ...base, minVersion: versao, maxVersion: versao, ciphers: 'DEFAULT@SECLEVEL=0' },
      TEMPO_DA_SONDAGEM_MS,
    );
    return socket.getProtocol() === versao;
  } catch {
    return false;
  } finally {
    socket?.destroy();
  }
}
