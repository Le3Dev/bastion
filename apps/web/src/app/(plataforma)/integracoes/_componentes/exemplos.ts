// Exemplos de texto exibidos na tela de Integrações (somente documentação, nada é executado).
// A chave de API nunca aparece nos exemplos: ela vem de um secret chamado BASTION_API_KEY.

const SEGREDO_DO_GITHUB = "$" + "{{ secrets.BASTION_API_KEY }}";

const SCRIPT_DE_AVALIACAO = String.raw`set -euo pipefail
ID=$(curl -sf -X POST "$BASTION_URL/v1/avaliacoes" \
  -H "Authorization: Bearer $BASTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sistemaId":"sis-1","perfil":"PASSIVO","notaMinima":80}' | jq -r '.id')
echo "Avaliação solicitada: $ID"
ESTADO=""
RESPOSTA=""
for i in $(seq 1 60); do
  RESPOSTA=$(curl -sf "$BASTION_URL/v1/avaliacoes/$ID" \
    -H "Authorization: Bearer $BASTION_API_KEY")
  ESTADO=$(echo "$RESPOSTA" | jq -r '.estado')
  case "$ESTADO" in CONCLUIDA|FALHOU|CANCELADA) break ;; esac
  sleep 10
done
if [ "$ESTADO" != "CONCLUIDA" ]; then
  echo "A avaliação terminou como $ESTADO"
  exit 1
fi
NOTA=$(echo "$RESPOSTA" | jq -r '.nota')
if [ "$NOTA" -lt 80 ]; then
  echo "Nota $NOTA abaixo da mínima (80). Reprovado."
  exit 1
fi
echo "Nota $NOTA. Aprovado."`;

const indentar = (texto: string, espacos: number): string =>
  texto
    .split("\n")
    .map((linha) => " ".repeat(espacos) + linha)
    .join("\n");

export const exemploGitHubActions = [
  "name: Bastion - avaliação de segurança",
  "on:",
  "  pull_request:",
  "    branches: [main]",
  "jobs:",
  "  avaliacao-bastion:",
  "    runs-on: ubuntu-latest",
  "    env:",
  "      BASTION_URL: https://api.bastion.exemplo.com.br",
  "      BASTION_API_KEY: " + SEGREDO_DO_GITHUB,
  "    steps:",
  "      - name: Avaliar e conferir a nota mínima",
  "        run: |",
  indentar(SCRIPT_DE_AVALIACAO, 10),
].join("\n");

export const exemploAzurePipelines = [
  "trigger:",
  "  branches:",
  "    include: [main]",
  "pool:",
  "  vmImage: ubuntu-latest",
  "variables:",
  "  BASTION_URL: https://api.bastion.exemplo.com.br",
  "steps:",
  "  - script: |",
  indentar(SCRIPT_DE_AVALIACAO, 6),
  "    displayName: Avaliar e conferir a nota mínima",
  "    env:",
  "      BASTION_API_KEY: $(BASTION_API_KEY)",
].join("\n");

export const exemploComCurl = String.raw`# 1) Solicitar a avaliação
curl -X POST "$BASTION_URL/v1/avaliacoes" \
  -H "Authorization: Bearer $BASTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sistemaId":"sis-1","perfil":"PASSIVO","notaMinima":80}'

# 2) Consultar até um estado final (CONCLUIDA, FALHOU ou CANCELADA)
curl "$BASTION_URL/v1/avaliacoes/<id>" \
  -H "Authorization: Bearer $BASTION_API_KEY"`;

export const exemploDeEntregaDoWebhook = String.raw`POST /seu-endpoint HTTP/1.1
Content-Type: application/json
X-Bastion-Evento-Id: evt_01JABCDEF123456
X-Bastion-Assinatura: sha256=9f2c...e41a

{"evento":"avaliacao.concluida","avaliacaoId":"ava-3","nota":61}`;

export const exemploDeVerificacaoEmNode = [
  'import { createHmac, timingSafeEqual } from "node:crypto";',
  "",
  "const eventosProcessados = new Set();",
  "",
  "export const assinaturaValida = (corpoBruto, cabecalho, segredo) => {",
  '  const esperado = "sha256=" + createHmac("sha256", segredo).update(corpoBruto).digest("hex");',
  "  const a = Buffer.from(esperado);",
  '  const b = Buffer.from(cabecalho ?? "");',
  "  return a.length === b.length && timingSafeEqual(a, b);",
  "};",
  "",
  "export const tratarEntrega = (corpoBruto, cabecalhos, segredo) => {",
  '  if (!assinaturaValida(corpoBruto, cabecalhos["x-bastion-assinatura"], segredo)) return 401;',
  '  const eventoId = cabecalhos["x-bastion-evento-id"];',
  "  if (eventosProcessados.has(eventoId)) return 200; // já tratado: reenvio idempotente",
  "  eventosProcessados.add(eventoId);",
  "  // ... processe o evento ...",
  "  return 200;",
  "};",
].join("\n");
