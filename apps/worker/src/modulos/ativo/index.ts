export {
  criarContexto,
  montarContexto,
  PREFIXO_DE_TESTE,
  type ContextoAtivo,
  type PedidoDoModulo,
} from './comum';
export { descobrirPaginas, type FormularioDescoberto, type PaginaDescoberta } from './descoberta';
export {
  avaliarWeb,
  sondarArquivosExpostos,
  sondarCorsEMetodos,
  sondarEntradaRefletida,
  sondarErrosDetalhados,
  sondarRedirecionamentos,
} from './web';
export {
  autenticar,
  FalhaDeAutenticacao,
  protegerConstatacoes,
  repetirChecagensWeb,
  sondarControleDeAcesso,
  sondarInjecao,
  sondarPaginasSemSessao,
  type SessaoDeTeste,
} from './autenticado';
export {
  avaliarIa,
  avaliarIntegridadeDoPrompt,
  avaliarSaida,
  avaliarVazamento,
  conectarIa,
  type ConversaDeIa,
} from './ia';
