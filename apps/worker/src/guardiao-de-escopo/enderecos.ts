import { BlockList, isIP } from 'node:net';

export interface OpcoesDeEndereco {
  /** Somente em desenvolvimento: libera redes privadas e loopback (nunca metadados de nuvem). */
  permitirRedesPrivadas: boolean;
}

export interface DecisaoDeEndereco {
  permitido: boolean;
  motivo: string;
}

type Familia = 'ipv4' | 'ipv6';

const METADADOS_IPV4 = '169.254.169.254';
const METADADOS_IPV6 = 'fd00:ec2::254';

function criarLista(entradas: ReadonlyArray<readonly [string, number | null, Familia]>): BlockList {
  const lista = new BlockList();
  for (const [endereco, prefixo, familia] of entradas) {
    if (prefixo === null) lista.addAddress(endereco, familia);
    else lista.addSubnet(endereco, prefixo, familia);
  }
  return lista;
}

/** Redes privadas e loopback: podem ser liberadas em desenvolvimento. */
const REDES_PRIVADAS = criarLista([
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['::1', null, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
]);

/** Sempre bloqueadas, em qualquer ambiente. */
const SEMPRE_BLOQUEADAS = criarLista([
  ['0.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['255.255.255.255', null, 'ipv4'],
  ['::', null, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
]);

/** Converte `::ffff:a.b.c.d` (ou `::ffff:7f00:1`) em IPv4; senão devolve o texto original. */
function desmapearIpv4(ip: string): string {
  const pontuado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (pontuado?.[1]) return pontuado[1];
  const hexa = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hexa?.[1] && hexa[2]) {
    const alto = Number.parseInt(hexa[1], 16);
    const baixo = Number.parseInt(hexa[2], 16);
    return `${alto >> 8}.${alto & 255}.${baixo >> 8}.${baixo & 255}`;
  }
  return ip;
}

export function avaliarEndereco(ip: string, opcoes: OpcoesDeEndereco): DecisaoDeEndereco {
  const limpo = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const normalizado = desmapearIpv4(limpo);
  const versao = isIP(normalizado);
  if (versao === 0) {
    return { permitido: false, motivo: 'Endereço IP inválido' };
  }
  const familia: Familia = versao === 4 ? 'ipv4' : 'ipv6';

  if (normalizado === METADADOS_IPV4 || normalizado === METADADOS_IPV6) {
    return { permitido: false, motivo: 'Endereço bloqueado: endereço de metadados de nuvem' };
  }
  if (SEMPRE_BLOQUEADAS.check(normalizado, familia)) {
    return { permitido: false, motivo: 'Endereço bloqueado: faixa reservada, link-local ou multicast' };
  }
  if (REDES_PRIVADAS.check(normalizado, familia)) {
    if (opcoes.permitirRedesPrivadas) {
      return { permitido: true, motivo: 'Rede privada liberada (modo de desenvolvimento)' };
    }
    return { permitido: false, motivo: 'Endereço bloqueado: rede privada ou loopback' };
  }
  return { permitido: true, motivo: 'Endereço público' };
}
