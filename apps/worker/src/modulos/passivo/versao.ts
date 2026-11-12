import {
  conformidade,
  descreverRequisicao,
  descreverResposta,
  primeiroValor,
  type Constatacao,
  type RespostaColetada,
  type TipoDeConstatacao,
} from './tipos';

const TEM_NUMERO_DE_VERSAO = /\d+(?:\.\d+)+|\/\d+/;

const OUTROS_CABECALHOS_DE_VERSAO = ['x-aspnet-version', 'x-aspnetmvc-version', 'x-generator'] as const;

function constatar(
  resposta: RespostaColetada,
  tipo: TipoDeConstatacao,
  nome: string,
  valor: string,
  correcao: string,
): Constatacao {
  return {
    tipo,
    titulo: `Versão de software exposta no cabeçalho ${nome}`,
    severidade: 'BAIXA',
    local: `cabecalho:${nome}`,
    descricao: `O cabeçalho ${nome} revela a tecnologia ou a versão usada ("${valor}"). Isso ajuda um atacante a procurar vulnerabilidades conhecidas para essa versão.`,
    evidencia: {
      requisicao: descreverRequisicao(resposta),
      resposta: descreverResposta(resposta, [nome]),
      observacao: `O valor "${valor}" identifica o software do servidor.`,
    },
    correcaoSugerida: correcao,
    conformidade: conformidade(false),
  };
}

export function analisarExposicaoDeVersao(resposta: RespostaColetada): Constatacao[] {
  const constatacoes: Constatacao[] = [];

  const servidor = primeiroValor(resposta.cabecalhos['server']);
  if (servidor !== undefined && TEM_NUMERO_DE_VERSAO.test(servidor)) {
    constatacoes.push(
      constatar(
        resposta,
        'VERSAO_EXPOSTA_SERVER',
        'server',
        servidor,
        'Oculte a versão.\n\nnginx:\nserver_tokens off;\n\nExpress (proxy reverso):\nremova o cabeçalho no proxy ou use app.disable(\'x-powered-by\') e configure o servidor de borda para não enviar a versão.',
      ),
    );
  }

  const poweredBy = primeiroValor(resposta.cabecalhos['x-powered-by']);
  if (poweredBy !== undefined) {
    constatacoes.push(
      constatar(
        resposta,
        'VERSAO_EXPOSTA_X_POWERED_BY',
        'x-powered-by',
        poweredBy,
        "Remova o cabeçalho.\n\nnginx:\nproxy_hide_header X-Powered-By;\n\nExpress:\napp.disable('x-powered-by');  // ou use helmet()",
      ),
    );
  }

  for (const nome of OUTROS_CABECALHOS_DE_VERSAO) {
    const valor = primeiroValor(resposta.cabecalhos[nome]);
    if (valor !== undefined) {
      constatacoes.push(
        constatar(
          resposta,
          'VERSAO_EXPOSTA_OUTROS',
          nome,
          valor,
          `Remova o cabeçalho.\n\nnginx:\nproxy_hide_header ${nome};\n\nExpress:\nres.removeHeader('${nome}');`,
        ),
      );
    }
  }

  return constatacoes;
}
