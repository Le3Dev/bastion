import type { Constatacao } from '@bastion/contratos';
import { ServicoDeAuditoria } from '../../auditoria/aplicacao/ServicoDeAuditoria';
import type { ContextoDaRequisicao } from '../../compartilhado/autenticacao/contexto';
import { emContextoDaOrganizacao } from '../../compartilhado/banco/conexao';
import { avaliacoes } from '../../compartilhado/banco/esquema';
import { relogioDoSistema } from '../../compartilhado/relogio';
import {
  cadastrarOrganizacaoDeTeste,
  corpoDeSistema,
  type AmbienteDeTeste,
  type OrganizacaoDeTeste,
} from '../../compartilhado/teste/ambiente-de-teste';
import type { Filas } from '../../integracoes/filas';
import { ServicoDeAchados } from '../aplicacao/ServicoDeAchados';

/** Apoio aos testes de integração de achados e relatórios (não entra no build de produção). */
export interface CenarioDeTeste extends OrganizacaoDeTeste {
  sistemaId: string;
  contexto: ContextoDaRequisicao;
}

export const contextoDeTeste = (
  organizacaoId: string,
  papel: ContextoDaRequisicao['papel'] = 'DONO',
): ContextoDaRequisicao => ({
  organizacaoId,
  papel,
  ator: { tipo: 'USUARIO', id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Analista' },
  membroId: null,
});

export const criarCenario = async (
  ambiente: AmbienteDeTeste,
  sufixo: string,
): Promise<CenarioDeTeste> => {
  const organizacao = await cadastrarOrganizacaoDeTeste(ambiente.app, sufixo);
  const resposta = await ambiente.app.inject({
    method: 'POST',
    url: '/v1/sistemas',
    headers: { cookie: organizacao.cookie },
    payload: corpoDeSistema(),
  });
  if (resposta.statusCode !== 201) {
    throw new Error(`Cadastro do sistema de teste falhou: ${resposta.statusCode} ${resposta.body}`);
  }
  return {
    ...organizacao,
    sistemaId: resposta.json<{ id: string }>().id,
    contexto: contextoDeTeste(organizacao.organizacaoId),
  };
};

/** Insere uma avaliação diretamente (o contexto de avaliações é testado à parte). */
export const inserirAvaliacao = async (
  ambiente: AmbienteDeTeste,
  cenario: Pick<CenarioDeTeste, 'organizacaoId' | 'sistemaId'>,
  notaMinima = 70,
): Promise<string> =>
  emContextoDaOrganizacao(ambiente.db, cenario.organizacaoId, async (tx) => {
    const [linha] = await tx
      .insert(avaliacoes)
      .values({
        organizacaoId: cenario.organizacaoId,
        sistemaId: cenario.sistemaId,
        perfil: 'PASSIVO',
        origem: 'WEB',
        estado: 'CONCLUIDA',
        notaMinima,
        solicitadaPor: 'Ana Analista',
      })
      .returning({ id: avaliacoes.id });
    if (!linha) throw new Error('Não foi possível inserir a avaliação de teste.');
    return linha.id;
  });

export const constatacaoDeTeste = (sobrescrever: Partial<Constatacao> = {}): Constatacao => ({
  tipo: 'CABECALHO_CSP_AUSENTE',
  titulo: 'Cabeçalho Content-Security-Policy ausente',
  severidade: 'ALTA',
  local: '/login',
  descricao: 'A política de segurança de conteúdo não foi enviada pelo servidor.',
  evidencia: {
    requisicao: 'GET /login',
    resposta: 'HTTP/1.1 200 OK',
    observacao: 'Cabeçalho ausente',
  },
  correcaoSugerida: 'Envie o cabeçalho Content-Security-Policy.',
  conformidade: { owasp: ['A05:2021'], lgpd: ['Art. 46'] },
  ...sobrescrever,
});

/** Serviço de achados próprio do teste, com as filas falsas informadas (a vigilância é observável). */
export const criarServicoDeAchados = (
  ambiente: AmbienteDeTeste,
  filas: Pick<Filas, 'agendarVigilancia'>,
): ServicoDeAchados =>
  new ServicoDeAchados(
    ambiente.db,
    filas as unknown as Filas,
    relogioDoSistema,
    new ServicoDeAuditoria(relogioDoSistema),
  );
