import { describe, expect, it } from 'vitest';
import { avaliarEndereco } from './enderecos';

const PROD = { permitirRedesPrivadas: false };
const DEV = { permitirRedesPrivadas: true };

describe('avaliarEndereco', () => {
  it.each([
    '0.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '169.254.10.10',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
  ])('bloqueia %s', (ip) => {
    expect(avaliarEndereco(ip, PROD).permitido).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.255.255', '198.20.0.1', '2606:4700:4700::1111'])(
    'permite %s',
    (ip) => {
      expect(avaliarEndereco(ip, PROD).permitido).toBe(true);
    },
  );

  it('dá motivo específico para metadados de nuvem', () => {
    const decisao = avaliarEndereco('169.254.169.254', PROD);
    expect(decisao.permitido).toBe(false);
    expect(decisao.motivo).toContain('endereço de metadados de nuvem');
  });

  it('metadados de nuvem são bloqueados mesmo com redes privadas liberadas', () => {
    expect(avaliarEndereco('169.254.169.254', DEV).permitido).toBe(false);
    expect(avaliarEndereco('::ffff:169.254.169.254', DEV).permitido).toBe(false);
    expect(avaliarEndereco('fd00:ec2::254', DEV).permitido).toBe(false);
  });

  it('avalia IPv4 mapeado em IPv6 como IPv4', () => {
    expect(avaliarEndereco('::ffff:127.0.0.1', PROD).permitido).toBe(false);
    expect(avaliarEndereco('::ffff:7f00:1', PROD).permitido).toBe(false);
    expect(avaliarEndereco('::ffff:10.0.0.5', PROD).permitido).toBe(false);
    expect(avaliarEndereco('::ffff:8.8.8.8', PROD).permitido).toBe(true);
  });

  it('libera privados e loopback em desenvolvimento', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.0.10', '172.20.0.1', '::1', 'fd00::1']) {
      expect(avaliarEndereco(ip, DEV).permitido).toBe(true);
    }
  });

  it('em desenvolvimento ainda bloqueia multicast e reservados', () => {
    expect(avaliarEndereco('224.0.0.1', DEV).permitido).toBe(false);
    expect(avaliarEndereco('0.0.0.0', DEV).permitido).toBe(false);
  });

  it('rejeita texto que não é IP', () => {
    expect(avaliarEndereco('exemplo.com', PROD)).toEqual({ permitido: false, motivo: 'Endereço IP inválido' });
  });
});
