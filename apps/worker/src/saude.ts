import { createServer, type Server } from 'node:http';

/** Servidor HTTP mínimo para as probes do Kubernetes: GET /saude responde { ok: true }. */
export function iniciarServidorDeSaude(porta: number): Promise<{ close: () => Promise<void> }> {
  const servidor: Server = createServer((requisicao, resposta) => {
    const caminho = (requisicao.url ?? '').split('?')[0];
    if (requisicao.method === 'GET' && caminho === '/saude') {
      resposta.writeHead(200, { 'content-type': 'application/json' });
      resposta.end(JSON.stringify({ ok: true }));
      return;
    }
    resposta.writeHead(404, { 'content-type': 'application/json' });
    resposta.end(JSON.stringify({ ok: false }));
  });
  return new Promise((resolver, rejeitar) => {
    servidor.once('error', rejeitar);
    servidor.listen(porta, '0.0.0.0', () => {
      servidor.off('error', rejeitar);
      resolver({
        close: () =>
          new Promise<void>((ok, falha) => {
            servidor.close((erro) => (erro ? falha(erro) : ok()));
            servidor.closeAllConnections();
          }),
      });
    });
  });
}
