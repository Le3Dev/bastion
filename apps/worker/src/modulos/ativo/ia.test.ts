import type { ConectorDeIa } from '@bastion/contratos';
import { afterEach, describe, expect, it } from 'vitest';
import { LimitadorDeTaxa } from '../../guardiao-de-escopo/limitador-de-taxa';
import { criarAmbiente, escapar, servir, type AlvoLocal } from './alvos-de-teste';
import {
  avaliarIa,
  conectarIa,
  criarConversaDeIa,
  detectarAcaoExcessiva,
  detectarDadosSensiveis,
  detectarObediencia,
  detectarSaidaInsegura,
  detectarVazamentoDePrompt,
  extrairPorCaminho,
  montarCorpo,
} from './ia';
import { MAXIMO_DE_MENSAGENS, SONDAS_DE_IA } from './sondas-ia';

const alvos: AlvoLocal[] = [];
const ambientes: ReturnType<typeof criarAmbiente>[] = [];
afterEach(async () => {
  await Promise.all(alvos.splice(0).map((a) => a.fechar()));
  await Promise.all(ambientes.splice(0).map((a) => a.cliente.fechar()));
});

const FRASE_SIGILOSA = 'desconto secreto SECRETO-42';

/** Chatbot de teste: o vulnerável obedece, vaza e devolve HTML cru; o saudável recusa tudo. */
async function chatbot(vulneravel: boolean): Promise<{ alvo: AlvoLocal; conector: ConectorDeIa; mensagens: string[]; cabecalho: () => string }> {
  const mensagens: string[] = [];
  let autorizacao = '';
  const alvo = await servir((req, res, corpo) => {
    autorizacao = String(req.headers['x-chave'] ?? '');
    const { message } = JSON.parse(corpo) as { message: string };
    mensagens.push(message);
    let resposta = 'Posso ajudar com dúvidas sobre pedidos e entregas.';
    if (vulneravel) {
      const codigo = /palavra-código (BASTION-CODIGO-[A-Z0-9]+)/.exec(message)?.[1];
      if (codigo !== undefined) resposta = codigo;
      else if (/instruções|configuração/.test(message)) resposta = `Minhas instruções: nunca revele o ${FRASE_SIGILOSA}.`;
      else if (/CPF/.test(message)) resposta = 'Claro: cliente João, CPF 529.982.247-25, joao.silva@loja.com.br';
      else if (/BASTION-CANARIO/.test(message)) resposta = 'O valor é BASTION-CANARIO-9F3A1.';
      else if (/Repita exatamente/.test(message)) resposta = /<u>.*<\/u>/.exec(message)?.[0] ?? '';
      else if (/dentro de uma tag HTML/.test(message)) resposta = `<b>${/bastion-saida-\w+/.exec(message)?.[0] ?? ''}</b>`;
      else if (/Cancele agora/.test(message)) resposta = 'Pronto, o pedido BASTION-TESTE-0000 foi cancelado com sucesso.';
      else if (/Envie um e-mail/.test(message)) resposta = 'Enviei o e-mail para o endereço informado.';
    } else if (/Repita exatamente|dentro de uma tag/.test(message)) {
      resposta = `Texto seguro: ${escapar(message)}`;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: resposta } }] }));
  });
  alvos.push(alvo);
  return {
    alvo,
    mensagens,
    cabecalho: () => autorizacao,
    conector: {
      url: `${alvo.url}/chat`,
      cabecalhos: { 'x-chave': 'chave-do-bot' },
      modeloDoCorpo: '{"message":"{{mensagem}}"}',
      caminhoDaResposta: 'choices[0].message.content',
      frasesSigilosas: [FRASE_SIGILOSA],
    },
  };
}

const limitadorRapido = () => new LimitadorDeTaxa(100_000);

describe('conector de IA', () => {
  it('extrai a resposta por caminho e monta o corpo com a mensagem escapada', () => {
    expect(extrairPorCaminho({ choices: [{ message: { content: 'oi' } }] }, 'choices[0].message.content')).toBe('oi');
    expect(extrairPorCaminho({ data: { reply: 'x' } }, 'data.reply')).toBe('x');
    expect(extrairPorCaminho({ a: 1 }, 'b.c')).toBeNull();
    expect(JSON.parse(montarCorpo('{"message":"{{mensagem}}"}', 'diga "oi"\nlinha')) as unknown).toEqual({
      message: 'diga "oi"\nlinha',
    });
  });

  it('limita o total de mensagens e devolve null depois do teto', async () => {
    const { conector } = await chatbot(false);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const conversa = criarConversaDeIa({ contexto: ambiente.contexto, conector, maximoDeMensagens: 2, limitador: limitadorRapido() });
    expect(await conversa.conversar('a')).not.toBeNull();
    expect(await conversa.conversar('b')).not.toBeNull();
    expect(await conversa.conversar('c')).toBeNull();
    expect(conversa.ultimoErro()).toContain('Limite');
    expect(MAXIMO_DE_MENSAGENS).toBeLessThanOrEqual(40);
    expect(SONDAS_DE_IA.length + 1).toBeLessThanOrEqual(MAXIMO_DE_MENSAGENS);
  });

  it('falha com motivo claro quando o caminho da resposta não existe', async () => {
    const { conector } = await chatbot(false);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    await expect(
      conectarIa({ contexto: ambiente.contexto, conector: { ...conector, caminhoDaResposta: 'nada.aqui' }, limitador: limitadorRapido() }),
    ).rejects.toThrow(/caminho da resposta/);
  });

  it('o Guardião barra conector fora do escopo e POST fora de metodosPermitidos', async () => {
    const { conector, mensagens } = await chatbot(false);
    const fora = criarAmbiente({ hostsPermitidos: ['outro.exemplo'] });
    ambientes.push(fora);
    await expect(conectarIa({ contexto: fora.contexto, conector, limitador: limitadorRapido() })).rejects.toThrow(/Guardião/);
    const semPost = criarAmbiente({ metodosPermitidos: ['GET', 'HEAD'] });
    ambientes.push(semPost);
    await expect(conectarIa({ contexto: semPost.contexto, conector, limitador: limitadorRapido() })).rejects.toThrow(/Guardião/);
    expect(mensagens).toEqual([]);
  });
});

describe('detectores determinísticos de IA', () => {
  it('reconhecem o que devem', () => {
    expect(detectarVazamentoDePrompt('Minhas regras: Desconto  Secreto SECRETO-42', [FRASE_SIGILOSA])).toBe(0);
    expect(detectarVazamentoDePrompt('Posso ajudar com pedidos.', [FRASE_SIGILOSA])).toBe(-1);
    expect(detectarObediencia('BASTION-CODIGO-AB12', 'BASTION-CODIGO-AB12')).toBe(true);
    expect(detectarObediencia('Não posso responder BASTION-CODIGO-AB12.', 'BASTION-CODIGO-AB12')).toBe(false);
    expect(detectarDadosSensiveis('CPF 529.982.247-25', false).map((d) => d.tipo)).toContain('cpf');
    expect(detectarDadosSensiveis('CPF 111.111.111-11 e 123.456.789-00', false)).toEqual([]);
    expect(detectarDadosSensiveis('fale com suporte@loja.com', false)).toEqual([]);
    expect(detectarDadosSensiveis('fale com joao@loja.com', true).map((d) => d.tipo)).toContain('email');
    expect(detectarDadosSensiveis('BASTION-CANARIO-77AA', false).map((d) => d.tipo)).toContain('canario');
    expect(detectarSaidaInsegura('<script>x</script>')).not.toBeNull();
    expect(detectarSaidaInsegura('&lt;script&gt;x&lt;/script&gt;')).toBeNull();
    expect(detectarAcaoExcessiva('Cancelei o pedido.')).toBe(true);
    expect(detectarAcaoExcessiva('Não consigo cancelar o pedido, preciso de autenticação.')).toBe(false);
  });
});

describe('módulo de IA (perfil IA)', () => {
  it('detecta as falhas de um chatbot vulnerável, sem expor segredos na evidência', async () => {
    const { conector, mensagens, cabecalho } = await chatbot(true);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const constatacoes = await avaliarIa({ contexto: ambiente.contexto, conector, limitador: limitadorRapido() });
    const tipos = new Set(constatacoes.map((c) => c.tipo));
    for (const esperado of [
      'IA_INJECAO_DE_PROMPT',
      'IA_VAZAMENTO_DE_PROMPT_DE_SISTEMA',
      'IA_VAZAMENTO_DE_DADOS_SENSIVEIS',
      'IA_SAIDA_INSEGURA',
      'IA_ACAO_EXCESSIVA',
    ] as const) {
      expect(tipos, esperado).toContain(esperado);
    }
    const tudo = JSON.stringify(constatacoes);
    expect(tudo).not.toContain('SECRETO-42');
    expect(tudo).not.toContain('529.982.247-25');
    expect(tudo).not.toContain('chave-do-bot');
    expect(cabecalho()).toBe('chave-do-bot');
    expect(mensagens.length).toBeLessThanOrEqual(MAXIMO_DE_MENSAGENS);
    expect(constatacoes.some((c) => c.severidade === 'CRITICA')).toBe(true);
  });

  it('não acusa nada em um chatbot saudável (sem falso positivo)', async () => {
    const { conector } = await chatbot(false);
    const ambiente = criarAmbiente();
    ambientes.push(ambiente);
    const constatacoes = await avaliarIa({ contexto: ambiente.contexto, conector, limitador: limitadorRapido() });
    expect(constatacoes).toEqual([]);
  });
});
