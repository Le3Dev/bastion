export interface MensagemDoModelo {
  papel: 'user' | 'assistant';
  texto: string;
}

export interface OpcoesDeCompletar {
  sistema: string;
  mensagens: MensagemDoModelo[];
  maxTokens?: number;
}

export interface ClienteModelo {
  completar(opcoes: OpcoesDeCompletar): Promise<string>;
}

export interface ConfigDoCliente {
  url: string;
  modelo: string;
  chave: string;
  timeoutMs?: number;
}

const TIMEOUT_PADRAO_MS = 15_000;
const MAX_TOKENS_PADRAO = 300;
const VERSAO_DA_API = '2023-06-01';

interface BlocoDeResposta {
  type?: unknown;
  text?: unknown;
}

function extrairTexto(corpo: unknown): string | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const conteudo = (corpo as { content?: unknown }).content;
  if (!Array.isArray(conteudo)) return null;
  const partes: string[] = [];
  for (const bloco of conteudo as BlocoDeResposta[]) {
    if (bloco && bloco.type === 'text' && typeof bloco.text === 'string') partes.push(bloco.text);
  }
  return partes.length > 0 ? partes.join('') : null;
}

/** Cliente mínimo da Messages API do provedor. A chamada vai ao provedor, não ao alvo (não passa pelo Guardião). */
export function criarClienteModelo(config: ConfigDoCliente): ClienteModelo {
  const timeoutMs = config.timeoutMs ?? TIMEOUT_PADRAO_MS;
  return {
    async completar(opcoes) {
      const controlador = new AbortController();
      const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
      try {
        const resposta = await fetch(config.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.chave,
            'anthropic-version': VERSAO_DA_API,
          },
          body: JSON.stringify({
            model: config.modelo,
            max_tokens: opcoes.maxTokens ?? MAX_TOKENS_PADRAO,
            system: opcoes.sistema,
            messages: opcoes.mensagens.map((m) => ({ role: m.papel, content: m.texto })),
          }),
          signal: controlador.signal,
        });
        if (!resposta.ok) {
          throw new Error(`O provedor de IA respondeu com status ${resposta.status}.`);
        }
        let corpo: unknown;
        try {
          corpo = await resposta.json();
        } catch {
          throw new Error('O provedor de IA devolveu uma resposta que não é JSON válido.');
        }
        const texto = extrairTexto(corpo);
        if (texto === null) throw new Error('O provedor de IA devolveu uma resposta sem texto.');
        return texto.trim();
      } catch (erro) {
        if (controlador.signal.aborted) {
          throw new Error(`A chamada ao provedor de IA excedeu o tempo limite de ${timeoutMs} ms.`);
        }
        if (erro instanceof Error && erro.message.startsWith('O provedor de IA')) throw erro;
        throw new Error('Falha ao contatar o provedor de IA.');
      } finally {
        clearTimeout(temporizador);
      }
    },
  };
}
