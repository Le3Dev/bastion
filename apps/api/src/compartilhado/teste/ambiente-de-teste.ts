import { join } from 'node:path';
import type {
  EventoAoVivo,
  ResultadoDaVerificacao,
  TarefaEntregarWebhook,
  TarefaExecutarAvaliacao,
  TarefaVerificarPropriedade,
} from '@bastion/contratos';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { criarAplicacao } from '../../aplicacao';
import type {
  AoVivo,
  CancelarAssinatura,
  OuvinteAoVivo,
} from '../../avaliacoes/infraestrutura/ao-vivo';
import type { Armazenamento } from '../../integracoes/armazenamento';
import type { Filas, TarefaDeVigilancia } from '../../integracoes/filas';
import { criarConexao, type Banco } from '../banco/conexao';
import type { Config } from '../config';
import { relogioDoSistema } from '../relogio';

try {
  process.loadEnvFile(join(import.meta.dirname, '..', '..', '..', '..', '..', '.env'));
} catch {
  // Sem .env: vale o que já está no ambiente.
}

export const SENHA_DE_TESTE = 'senha-muito-segura-1';

/** Filas falsas: guardam as tarefas e devolvem o resultado programado. */
export class FilasFalsas implements Filas {
  resultadoDaVerificacao: ResultadoDaVerificacao | Error = { verificado: true, mensagem: 'ok' };
  verificacoes: TarefaVerificarPropriedade[] = [];
  avaliacoes: TarefaExecutarAvaliacao[] = [];
  entregas: TarefaEntregarWebhook[] = [];
  cancelamentos: string[] = [];
  vigilancias: { tarefa: TarefaDeVigilancia; atrasoMs: number }[] = [];
  /** Quando preenchido, `enfileirarAvaliacao` falha com este erro (simula a fila fora do ar). */
  erroAoEnfileirarAvaliacao: Error | null = null;

  async enfileirarVerificacao(tarefa: TarefaVerificarPropriedade): Promise<ResultadoDaVerificacao> {
    this.verificacoes.push(tarefa);
    if (this.resultadoDaVerificacao instanceof Error) throw this.resultadoDaVerificacao;
    return this.resultadoDaVerificacao;
  }
  async enfileirarAvaliacao(tarefa: TarefaExecutarAvaliacao): Promise<void> {
    if (this.erroAoEnfileirarAvaliacao) throw this.erroAoEnfileirarAvaliacao;
    this.avaliacoes.push(tarefa);
  }
  async enfileirarEntregaDeWebhook(tarefa: TarefaEntregarWebhook): Promise<void> {
    this.entregas.push(tarefa);
  }
  async agendarVigilancia(tarefa: TarefaDeVigilancia, atrasoMs: number): Promise<void> {
    this.vigilancias.push({ tarefa, atrasoMs });
  }
  async sinalizarCancelamento(avaliacaoId: string): Promise<void> {
    this.cancelamentos.push(avaliacaoId);
  }
  async verificarSaude(): Promise<void> {}
  async fechar(): Promise<void> {}
}

/** Armazenamento em memória: guarda os objetos enviados, por chave. */
export class ArmazenamentoEmMemoria implements Armazenamento {
  readonly objetos = new Map<string, { corpo: Uint8Array; tipo: string }>();

  async garantirBucket(): Promise<void> {}
  async enviar(chave: string, corpo: Uint8Array | string, tipo: string): Promise<void> {
    this.objetos.set(chave, {
      corpo: typeof corpo === 'string' ? new TextEncoder().encode(corpo) : corpo,
      tipo,
    });
  }
  async obter(chave: string): Promise<Uint8Array> {
    const objeto = this.objetos.get(chave);
    if (!objeto) throw new Error(`Objeto inexistente no armazenamento de teste: ${chave}.`);
    return objeto.corpo;
  }
  fechar(): void {}
}

/** Ao vivo em memória: entrega os eventos aos ouvintes do mesmo processo e guarda o histórico. */
export class AoVivoEmMemoria implements AoVivo {
  readonly publicados: { avaliacaoId: string; evento: EventoAoVivo }[] = [];
  private readonly ouvintes = new Map<string, Set<OuvinteAoVivo>>();

  async publicarAoVivo(avaliacaoId: string, evento: EventoAoVivo): Promise<void> {
    this.publicados.push({ avaliacaoId, evento });
    for (const ouvinte of [...(this.ouvintes.get(avaliacaoId) ?? [])]) ouvinte(evento);
  }
  async assinar(avaliacaoId: string, ouvinte: OuvinteAoVivo): Promise<CancelarAssinatura> {
    const conjunto = this.ouvintes.get(avaliacaoId) ?? new Set<OuvinteAoVivo>();
    conjunto.add(ouvinte);
    this.ouvintes.set(avaliacaoId, conjunto);
    return async () => {
      conjunto.delete(ouvinte);
    };
  }
  async fechar(): Promise<void> {
    this.ouvintes.clear();
  }
}

export interface AmbienteDeTeste {
  app: FastifyInstance;
  db: Banco;
  filas: FilasFalsas;
  armazenamento: ArmazenamentoEmMemoria;
  aoVivo: AoVivoEmMemoria;
  /** Esvazia todas as tabelas (conexão do migrador, dono das tabelas). */
  limpar(): Promise<void>;
  encerrar(): Promise<void>;
}

const exigirVariavel = (nome: string): string => {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável ${nome} não definida. Copie .env.example para .env e rode pnpm infra:subir.`);
  }
  return valor;
};

export const criarAmbienteDeTeste = async (): Promise<AmbienteDeTeste> => {
  const urlDoApp = exigirVariavel('DATABASE_URL_TESTE');
  const urlDoMigrador = exigirVariavel('DATABASE_URL_TESTE_MIGRACAO');
  const config: Config = {
    databaseUrl: urlDoApp,
    redisUrl: 'redis://localhost:6379',
    s3: {
      endpoint: 'http://localhost:9000',
      regiao: 'us-east-1',
      chaveDeAcesso: 'teste',
      segredo: 'teste',
      bucketDeRelatorios: 'teste',
    },
    portaDaApi: 0,
    origemDaWeb: 'http://localhost:3000',
    sessaoCookieSeguro: false,
    sessaoDuracaoHoras: 12,
    limiteDeTaxaAtivo: false,
  };
  const conexao = criarConexao(urlDoApp);
  const migrador = new pg.Pool({ connectionString: urlDoMigrador, max: 2 });
  const filas = new FilasFalsas();
  const armazenamento = new ArmazenamentoEmMemoria();
  const aoVivo = new AoVivoEmMemoria();
  const app = await criarAplicacao({
    config,
    db: conexao.db,
    filas,
    relogio: relogioDoSistema,
    armazenamento,
    aoVivo,
  });
  await app.ready();

  return {
    app,
    db: conexao.db,
    filas,
    armazenamento,
    aoVivo,
    limpar: async () => {
      await migrador.query(
        'TRUNCATE organizacoes, usuarios, sessoes, chaves_de_api, eventos_de_saida, eventos_processados CASCADE',
      );
    },
    encerrar: async () => {
      await app.close();
      await conexao.fechar();
      await migrador.end();
    },
  };
};

export interface OrganizacaoDeTeste {
  organizacaoId: string;
  cookie: string;
  email: string;
}

/** Cadastra uma organização pela API e devolve o cookie de sessão do DONO. */
export const cadastrarOrganizacaoDeTeste = async (
  app: FastifyInstance,
  sufixo: string,
): Promise<OrganizacaoDeTeste> => {
  const email = `dono-${sufixo}@exemplo.com.br`;
  const resposta = await app.inject({
    method: 'POST',
    url: '/v1/organizacoes',
    payload: {
      nomeDaOrganizacao: `Organização ${sufixo}`,
      nome: `Dono ${sufixo}`,
      email,
      senha: SENHA_DE_TESTE,
    },
  });
  if (resposta.statusCode !== 201) {
    throw new Error(`Cadastro de teste falhou: ${resposta.statusCode} ${resposta.body}`);
  }
  const sessao = resposta.cookies.find((c) => c.name === 'bastion_sessao');
  if (!sessao) throw new Error('A resposta do cadastro não trouxe o cookie de sessão.');
  const corpo = resposta.json<{ organizacao: { id: string } }>();
  return {
    organizacaoId: corpo.organizacao.id,
    cookie: `bastion_sessao=${sessao.value}`,
    email,
  };
};

export const corpoDeSistema = (
  sobrescrever: Partial<{
    nome: string;
    urlDeHomologacao: string;
    dominioDeProducao: string;
  }> = {},
) => ({
  nome: 'Portal de homologação',
  tipo: 'SITE' as const,
  urlDeHomologacao: 'https://homologacao.cliente.test',
  dominioDeProducao: 'producao.cliente.test',
  metodoDeVerificacao: 'ARQUIVO_WELL_KNOWN' as const,
  ...sobrescrever,
});
