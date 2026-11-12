import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { avaliarEndereco, type DecisaoDeEndereco, type OpcoesDeEndereco } from './enderecos';

export const CODIGO_ENDERECO_BLOQUEADO = 'BASTION_ENDERECO_BLOQUEADO';

/** Lançado pelo `lookup` seguro quando algum endereço resolvido é proibido. */
export class ErroDeEnderecoBloqueado extends Error {
  readonly code = CODIGO_ENDERECO_BLOQUEADO;

  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'ErroDeEnderecoBloqueado';
  }
}

export type ResolvedorDns = (hostname: string) => Promise<LookupAddress[]>;

/** Resolve com `dns.lookup` e `all: true`, para avaliar todos os endereços. */
export const resolverComDnsDoSistema: ResolvedorDns = (hostname) =>
  new Promise((resolver, rejeitar) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (erro, enderecos) => {
      if (erro) rejeitar(erro);
      else resolver(enderecos);
    });
  });

export interface OpcoesDoLookupSeguro extends OpcoesDeEndereco {
  resolver?: ResolvedorDns;
}

/**
 * `lookup` para sockets: resolve o DNS, avalia CADA endereço e só entrega ao socket endereços
 * já validados. Assim não há janela entre a checagem e a conexão (sem DNS rebinding).
 */
export function criarLookupSeguro(opcoes: OpcoesDoLookupSeguro): LookupFunction {
  const resolver = opcoes.resolver ?? resolverComDnsDoSistema;
  return (hostname, opcoesDoLookup, callback) => {
    resolver(hostname).then(
      (enderecos) => {
        const primeiro = enderecos[0];
        if (primeiro === undefined) {
          const erro: NodeJS.ErrnoException = new Error(`O host ${hostname} não tem endereços.`);
          erro.code = 'ENOTFOUND';
          callback(erro, []);
          return;
        }
        for (const endereco of enderecos) {
          const decisao = avaliarEndereco(endereco.address, opcoes);
          if (!decisao.permitido) {
            callback(new ErroDeEnderecoBloqueado(`${decisao.motivo} (${hostname} → ${endereco.address})`), []);
            return;
          }
        }
        if (opcoesDoLookup.all) callback(null, enderecos);
        else callback(null, primeiro.address, primeiro.family);
      },
      (erro: NodeJS.ErrnoException) => callback(erro, []),
    );
  };
}

/**
 * IPs literais na URL não passam pelo `lookup` do socket; por isso são avaliados antes de conectar.
 * Devolve `null` quando o host não é um IP literal.
 */
export function avaliarHostLiteral(hostname: string, opcoes: OpcoesDeEndereco): DecisaoDeEndereco | null {
  const limpo = hostname.replace(/^\[|\]$/g, '');
  if (isIP(limpo) === 0) return null;
  return avaliarEndereco(limpo, opcoes);
}

/** Procura, na cadeia de causas, o bloqueio de endereço lançado pelo `lookup` seguro. */
export function encontrarBloqueioDeEndereco(erro: unknown): ErroDeEnderecoBloqueado | null {
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 5 && atual !== undefined && atual !== null; nivel++) {
    if (atual instanceof ErroDeEnderecoBloqueado) return atual;
    if (typeof atual === 'object' && 'code' in atual && atual.code === CODIGO_ENDERECO_BLOQUEADO) {
      const motivo = 'message' in atual && typeof atual.message === 'string' ? atual.message : 'Endereço bloqueado';
      return new ErroDeEnderecoBloqueado(motivo);
    }
    atual = typeof atual === 'object' && 'cause' in atual ? atual.cause : undefined;
  }
  return null;
}
