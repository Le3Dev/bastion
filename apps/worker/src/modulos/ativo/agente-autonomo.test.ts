import { describe, expect, it, vi } from 'vitest';
import { criarCatalogoDeFerramentas, executarAgenteAutonomo, type FerramentaDoAgente } from './agente-autonomo';
import type { SessaoDeTeste } from './autenticado';
import type { ClienteModelo } from './cliente-modelo';
import { construirConstatacao, type ContextoAtivo } from './comum';

const constatacao = (titulo: string) =>
  construirConstatacao({
    tipo: 'SSRF',
    titulo,
    severidade: 'BAIXA',
    local: 'x',
    descricao: 'd',
    requisicao: 'GET /',
    resposta: 'HTTP 200',
    observacao: 'o',
    correcao: 'c',
    owasp: [],
  });

function ferramenta(nome: string, achados: number): FerramentaDoAgente & { executar: ReturnType<typeof vi.fn> } {
  return {
    nome,
    descricao: `faz ${nome}`,
    executar: vi.fn(async () => Array.from({ length: achados }, (_, i) => constatacao(`${nome}-${i}`))),
  };
}

function clienteRoteirizado(respostas: string[]): ClienteModelo & { chamadas: number } {
  const estado = { chamadas: 0 };
  return Object.assign(estado, {
    completar: async () => {
      const r = respostas[estado.chamadas];
      estado.chamadas += 1;
      return r ?? 'FIM';
    },
  });
}

describe('executarAgenteAutonomo', () => {
  it('executa só ferramentas do catálogo, acumula constatações e registra decisões', async () => {
    const a = ferramenta('a', 2);
    const b = ferramenta('b', 1);
    const registros: string[] = [];
    const achadas = await executarAgenteAutonomo({
      catalogo: [a, b],
      cliente: clienteRoteirizado(['a\nporque sim', '`b`', 'FIM']),
      orcamentoDePassos: 10,
      aoDecidir: (r) => registros.push(`${r.passo}:${r.ferramenta}:${r.constatacoes}`),
    });
    expect(achadas).toHaveLength(3);
    expect(registros).toEqual(['1:a:2', '2:b:1']);
  });

  it('encerra sem erro diante de escolha fora do catálogo', async () => {
    const a = ferramenta('a', 1);
    const achadas = await executarAgenteAutonomo({
      catalogo: [a],
      cliente: clienteRoteirizado(['GET http://outro.com/']),
      orcamentoDePassos: 5,
    });
    expect(achadas).toEqual([]);
    expect(a.executar).not.toHaveBeenCalled();
  });

  it('respeita o orçamento de passos e não repete ferramenta', async () => {
    const a = ferramenta('a', 1);
    const b = ferramenta('b', 1);
    const c = ferramenta('c', 1);
    const cliente = clienteRoteirizado(['a', 'b', 'c']);
    const achadas = await executarAgenteAutonomo({ catalogo: [a, b, c], cliente, orcamentoDePassos: 2 });
    expect(achadas).toHaveLength(2);
    expect(cliente.chamadas).toBe(2);
    expect(c.executar).not.toHaveBeenCalled();

    const d = ferramenta('d', 1);
    await executarAgenteAutonomo({ catalogo: [d], cliente: clienteRoteirizado(['d', 'd']), orcamentoDePassos: 5 });
    expect(d.executar).toHaveBeenCalledTimes(1);
  });

  it('devolve o que já tinha se o modelo falhar', async () => {
    const a = ferramenta('a', 2);
    let n = 0;
    const cliente: ClienteModelo = {
      completar: async () => {
        n += 1;
        if (n === 1) return 'a';
        throw new Error('provedor fora do ar');
      },
    };
    const achadas = await executarAgenteAutonomo({ catalogo: [a, ferramenta('b', 1)], cliente, orcamentoDePassos: 5 });
    expect(achadas).toHaveLength(2);
  });
});

describe('criarCatalogoDeFerramentas', () => {
  const contexto = {} as ContextoAtivo;
  const base = { contexto, urlInicial: 'http://alvo.local/', paginas: [] };

  it('inclui só as ferramentas anônimas sem sessão', () => {
    expect(criarCatalogoDeFerramentas(base).map((f) => f.nome)).toEqual([
      'arquivos_expostos',
      'cors_metodos',
      'redirecionamentos',
      'entrada_refletida',
      'erros_detalhados',
      'csrf',
      'ssrf',
    ]);
  });

  it('inclui as autenticadas com sessão e executa o detector (csrf sem formulários)', async () => {
    const nomes = criarCatalogoDeFerramentas({ ...base, sessao: {} as SessaoDeTeste }).map((f) => f.nome);
    expect(nomes.slice(-3)).toEqual(['paginas_sem_sessao', 'controle_de_acesso', 'injecao']);
    const csrf = criarCatalogoDeFerramentas(base).find((f) => f.nome === 'csrf');
    expect(await csrf?.executar()).toEqual([]);
  });
});
