import type { Constatacao } from '@bastion/contratos';
import type { SessaoDeTeste } from './autenticado';
import { sondarControleDeAcesso, sondarInjecao, sondarPaginasSemSessao } from './autenticado';
import type { ClienteModelo } from './cliente-modelo';
import type { ContextoAtivo } from './comum';
import type { PaginaDescoberta } from './descoberta';
import {
  analisarCsrf,
  sondarArquivosExpostos,
  sondarCorsEMetodos,
  sondarEntradaRefletida,
  sondarErrosDetalhados,
  sondarRedirecionamentos,
  sondarSsrf,
} from './web';

/** Verificação que o agente pode pedir. Mapeada a um detector determinístico; sem parâmetros livres. */
export interface FerramentaDoAgente {
  nome: string;
  descricao: string;
  executar(): Promise<Constatacao[]>;
}

export interface OpcoesDoCatalogo {
  contexto: ContextoAtivo;
  urlInicial: string;
  paginas: readonly PaginaDescoberta[];
  sessao?: SessaoDeTeste;
  paginasAutenticadas?: readonly PaginaDescoberta[];
}

/** Catálogo fechado: os alvos saem sempre das páginas descobertas, nunca do modelo. */
export function criarCatalogoDeFerramentas(opcoes: OpcoesDoCatalogo): FerramentaDoAgente[] {
  const { contexto, urlInicial, paginas, sessao } = opcoes;
  const autenticadas = opcoes.paginasAutenticadas ?? [];
  const catalogo: FerramentaDoAgente[] = [
    {
      nome: 'arquivos_expostos',
      descricao: 'Procura arquivos sensíveis expostos, listagem de diretório e security.txt.',
      executar: () => sondarArquivosExpostos(contexto, urlInicial, paginas),
    },
    {
      nome: 'cors_metodos',
      descricao: 'Verifica política CORS permissiva e métodos HTTP perigosos habilitados.',
      executar: () => sondarCorsEMetodos(contexto, urlInicial),
    },
    {
      nome: 'redirecionamentos',
      descricao: 'Testa redirecionamento aberto nos parâmetros das páginas descobertas.',
      executar: () => sondarRedirecionamentos(contexto, urlInicial, paginas),
    },
    {
      nome: 'entrada_refletida',
      descricao: 'Verifica se entradas são refletidas sem tratamento (indício de XSS).',
      executar: () => sondarEntradaRefletida(contexto, urlInicial, paginas),
    },
    {
      nome: 'erros_detalhados',
      descricao: 'Verifica vazamento de detalhes técnicos em mensagens de erro.',
      executar: () => sondarErrosDetalhados(contexto, urlInicial, paginas),
    },
    {
      nome: 'csrf',
      descricao: 'Analisa formulários que alteram estado sem proteção contra CSRF.',
      executar: () => Promise.resolve(analisarCsrf(paginas)),
    },
    {
      nome: 'ssrf',
      descricao: 'Testa parâmetros que aceitam URL quanto a requisição forjada pelo servidor (SSRF).',
      executar: () => sondarSsrf(contexto, paginas),
    },
  ];
  if (sessao !== undefined) {
    catalogo.push(
      {
        nome: 'paginas_sem_sessao',
        descricao: 'Confere se páginas autenticadas ficam acessíveis sem sessão.',
        executar: () => sondarPaginasSemSessao(sessao, autenticadas, paginas),
      },
      {
        nome: 'controle_de_acesso',
        descricao: 'Verifica falhas de controle de acesso nas páginas autenticadas.',
        executar: () => sondarControleDeAcesso(sessao, autenticadas),
      },
      {
        nome: 'injecao',
        descricao: 'Testa injeção (SQL, template, comando, travessia) nas entradas autenticadas.',
        executar: () => sondarInjecao(sessao, autenticadas),
      },
    );
  }
  return catalogo;
}

export interface RegistroDeDecisao {
  passo: number;
  ferramenta: string;
  motivo: string;
  constatacoes: number;
}

export interface OpcoesDoAgente {
  catalogo: FerramentaDoAgente[];
  cliente: ClienteModelo;
  orcamentoDePassos: number;
  aoDecidir?: (r: RegistroDeDecisao) => void;
}

const SISTEMA =
  'Você orquestra uma avaliação de segurança AUTORIZADA e contratada, sobre um alvo de propriedade do cliente, ' +
  'em modo não destrutivo. Você NÃO envia requisições nem declara vulnerabilidades: apenas escolhe a próxima ' +
  'verificação de um catálogo fechado, pelo NOME exato, uma por vez. Quem decide as constatações são os detectores. ' +
  'Responda em duas linhas: na primeira, somente o nome da ferramenta (ou FIM para encerrar); na segunda, um motivo curto. ' +
  'Não use nomes fora do catálogo e não repita ferramentas já usadas.';

function montarPrompt(
  catalogo: readonly FerramentaDoAgente[],
  usadas: ReadonlyMap<string, number>,
): string {
  const disponiveis = catalogo.filter((f) => !usadas.has(f.nome));
  const linhas = [
    'Ferramentas disponíveis:',
    ...disponiveis.map((f) => `- ${f.nome}: ${f.descricao}`),
    '',
    usadas.size === 0
      ? 'Nenhuma ferramenta usada ainda.'
      : `Já usadas (resultado):\n${[...usadas].map(([nome, n]) => `- ${nome}: ${n} constatação(ões)`).join('\n')}`,
    '',
    'Qual a próxima ferramenta? Responda com o nome ou FIM.',
  ];
  return linhas.join('\n');
}

function lerEscolha(resposta: string): { nome: string; motivo: string } {
  const linhas = resposta
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const nome = (linhas[0] ?? '').replace(/^[\s`"'*-]+|[\s`"'*.,;:]+$/g, '');
  return { nome, motivo: linhas.slice(1).join(' ').slice(0, 300) };
}

export async function executarAgenteAutonomo(opcoes: OpcoesDoAgente): Promise<Constatacao[]> {
  const { catalogo, cliente, orcamentoDePassos, aoDecidir } = opcoes;
  const porNome = new Map(catalogo.map((f) => [f.nome, f]));
  const usadas = new Map<string, number>();
  const acumuladas: Constatacao[] = [];

  for (let passo = 1; passo <= orcamentoDePassos; passo += 1) {
    if (usadas.size >= porNome.size) break;
    let resposta: string;
    try {
      resposta = await cliente.completar({
        sistema: SISTEMA,
        mensagens: [{ papel: 'user', texto: montarPrompt(catalogo, usadas) }],
        maxTokens: 200,
      });
    } catch {
      break;
    }
    const { nome, motivo } = lerEscolha(resposta);
    if (nome.toUpperCase() === 'FIM') break;
    const ferramenta = porNome.get(nome);
    if (ferramenta === undefined || usadas.has(nome)) break;

    let achadas: Constatacao[] = [];
    try {
      achadas = await ferramenta.executar();
    } catch {
      achadas = [];
    }
    usadas.set(nome, achadas.length);
    acumuladas.push(...achadas);
    aoDecidir?.({ passo, ferramenta: nome, motivo, constatacoes: achadas.length });
  }
  return acumuladas;
}
