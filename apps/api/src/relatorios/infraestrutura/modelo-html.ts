import { SEVERIDADES, type RelatorioDto, type Severidade } from '@bastion/contratos';

/** Texto de cada achado que não consta do resumo do contrato, mas entra no relatório impresso. */
export interface DetalheDoAchadoNoRelatorio {
  descricao: string;
  correcaoSugerida: string;
}

const ENTIDADES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa todo texto que vem de fora antes de entrar no HTML. */
export const escaparHtml = (texto: string): string =>
  texto.replace(/[&<>"']/g, (caractere) => ENTIDADES[caractere] ?? caractere);

const ROTULO_DA_SEVERIDADE: Readonly<Record<Severidade, string>> = {
  CRITICA: 'Crítica',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

const ROTULO_DO_ESTADO: Readonly<Record<string, string>> = {
  NOVO: 'Novo',
  CONFIRMADO: 'Confirmado',
  EM_CORRECAO: 'Em correção',
  REVALIDANDO: 'Revalidando',
  CORRIGIDO: 'Corrigido',
  REABERTO: 'Reaberto',
  RISCO_ACEITO: 'Risco aceito',
};

const DESCRICAO_DO_PERFIL: Readonly<Record<RelatorioDto['perfil'], string>> = {
  PASSIVO:
    'Passivo: apenas leitura. Cabeçalhos HTTP, cookies, certificado e protocolo TLS foram observados sem enviar cargas de ataque.',
  PADRAO: 'Padrão: verificações passivas com sondagens leves no ambiente de homologação.',
  COMPLETO: 'Completo: todas as verificações disponíveis, sempre limitadas ao ambiente de homologação.',
  IA: 'IA: avaliação de um aplicativo com inteligência artificial por meio do conector configurado, sempre limitada ao ambiente de homologação.',
};

const formatarData = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const CSS = `
:root {
  --papel: #FFFFFF;
  --tinta: #111111;
  --tinta-2: #444444;
  --suave: #767676;
  --linha: #D4D4D4;
  --fundo-suave: #F4F4F4;
  --sinal: #FFD60A;
  --critica: #B3261E;
  --alta: #B45309;
  --media: #8A6D00;
  --baixa: #1D5FA8;
  --aprovado: #1E7D4F;
  --reprovado: #B3261E;
}
* { box-sizing: border-box; }
body { margin: 0; padding: 0; background: var(--papel); color: var(--tinta); font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5; }
main { max-width: 780px; margin: 0 auto; padding: 24px; }
.faixa { background: var(--sinal); color: var(--tinta); padding: 10px 24px; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px; }
h1 { font-size: 24px; margin: 20px 0 4px; }
h2 { font-size: 15px; margin: 28px 0 10px; padding-bottom: 4px; border-bottom: 2px solid var(--tinta); text-transform: uppercase; letter-spacing: 0.06em; }
h3 { font-size: 13px; margin: 0 0 4px; }
p { margin: 0 0 8px; }
.meta { color: var(--tinta-2); margin: 0; }
.destaque { display: flex; align-items: center; gap: 24px; margin: 20px 0; padding: 16px; border: 2px solid var(--tinta); }
.nota { font-size: 64px; font-weight: bold; line-height: 1; }
.nota small { font-size: 18px; color: var(--suave); }
.selo { display: inline-block; padding: 4px 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; border: 2px solid currentColor; }
.selo.aprovado { color: var(--aprovado); }
.selo.reprovado { color: var(--reprovado); }
table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--linha); vertical-align: top; }
th { background: var(--fundo-suave); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.achado { border: 1px solid var(--linha); border-left: 6px solid var(--suave); padding: 10px 12px; margin: 0 0 10px; page-break-inside: avoid; }
.achado.critica { border-left-color: var(--critica); }
.achado.alta { border-left-color: var(--alta); }
.achado.media { border-left-color: var(--media); }
.achado.baixa { border-left-color: var(--baixa); }
.etiqueta { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; }
.etiqueta.critica { color: var(--critica); }
.etiqueta.alta { color: var(--alta); }
.etiqueta.media { color: var(--media); }
.etiqueta.baixa { color: var(--baixa); }
.local { font-family: "Courier New", monospace; color: var(--tinta-2); word-break: break-all; }
.rotulo { color: var(--suave); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin: 6px 0 0; }
.colunas { display: flex; gap: 24px; }
.colunas > div { flex: 1; }
.vazio { color: var(--suave); font-style: italic; }
footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid var(--linha); color: var(--suave); font-size: 10px; }
@page { size: A4; margin: 14mm; }
`;

const classeDaSeveridade = (severidade: Severidade): string => severidade.toLowerCase();

const tabelaDeSeveridades = (contagem: RelatorioDto['contagemPorSeveridade']): string => {
  const linhas = SEVERIDADES.map(
    (severidade) =>
      `<tr><td><span class="etiqueta ${classeDaSeveridade(severidade)}">${escaparHtml(ROTULO_DA_SEVERIDADE[severidade])}</span></td><td>${contagem[severidade] ?? 0}</td></tr>`,
  ).join('');
  return `<table><thead><tr><th>Severidade</th><th>Achados em aberto</th></tr></thead><tbody>${linhas}</tbody></table>`;
};

const blocoDeAchado = (
  achado: RelatorioDto['achados'][number],
  detalhe: DetalheDoAchadoNoRelatorio | undefined,
): string => {
  const classe = classeDaSeveridade(achado.severidade);
  const descricao = detalhe?.descricao
    ? `<p class="rotulo">Descrição</p><p>${escaparHtml(detalhe.descricao)}</p>`
    : '';
  const correcao = detalhe?.correcaoSugerida
    ? `<p class="rotulo">Correção sugerida</p><p>${escaparHtml(detalhe.correcaoSugerida)}</p>`
    : '';
  return `<div class="achado ${classe}">
<h3>${escaparHtml(achado.titulo)}</h3>
<p><span class="etiqueta ${classe}">${escaparHtml(ROTULO_DA_SEVERIDADE[achado.severidade])}</span> &middot; ${escaparHtml(ROTULO_DO_ESTADO[achado.estado] ?? achado.estado)} &middot; ${achado.ocorrencias} ocorrência(s)</p>
<p class="rotulo">Local</p><p class="local">${escaparHtml(achado.local)}</p>
${descricao}${correcao}
</div>`;
};

const tabelaDeConformidade = (
  titulo: string,
  itens: RelatorioDto['conformidade']['owasp'],
): string => {
  const corpo =
    itens.length === 0
      ? '<p class="vazio">Nenhum item mapeado.</p>'
      : `<table><thead><tr><th>Código</th><th>Achados</th></tr></thead><tbody>${itens
          .map((item) => `<tr><td>${escaparHtml(item.codigo)}</td><td>${item.quantidade}</td></tr>`)
          .join('')}</tbody></table>`;
  return `<div><h3>${escaparHtml(titulo)}</h3>${corpo}</div>`;
};

/** HTML autocontido do relatório (CSS inline, sem recursos externos), pronto para imprimir. */
export const renderizarHtml = (
  relatorio: RelatorioDto,
  detalhes: Readonly<Record<string, DetalheDoAchadoNoRelatorio>> = {},
): string => {
  const situacao = relatorio.aprovado ? 'Aprovado' : 'Reprovado';
  const classeDaSituacao = relatorio.aprovado ? 'aprovado' : 'reprovado';
  const achados =
    relatorio.achados.length === 0
      ? '<p class="vazio">Nenhum achado nesta avaliação.</p>'
      : relatorio.achados.map((achado) => blocoDeAchado(achado, detalhes[achado.id])).join('\n');
  const escopo = relatorio.escopo;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de segurança - ${escaparHtml(relatorio.sistemaNome)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="faixa">Bastion &middot; Relatório de segurança</div>
<main>
<h1>${escaparHtml(relatorio.sistemaNome)}</h1>
<p class="meta">Gerado em ${escaparHtml(formatarData(relatorio.geradoEm))} &middot; Perfil ${escaparHtml(relatorio.perfil)}</p>

<div class="destaque">
<div class="nota">${relatorio.nota}<small>/100</small></div>
<div>
<span class="selo ${classeDaSituacao}">${situacao}</span>
<p class="meta">Nota mínima exigida: ${relatorio.notaMinima}</p>
</div>
</div>

<h2>Resumo</h2>
<p>${escaparHtml(relatorio.resumo)}</p>
${tabelaDeSeveridades(relatorio.contagemPorSeveridade)}

<h2>Achados</h2>
${achados}

<h2>Conformidade</h2>
<div class="colunas">
${tabelaDeConformidade('OWASP', relatorio.conformidade.owasp)}
${tabelaDeConformidade('LGPD', relatorio.conformidade.lgpd)}
</div>

<h2>Escopo e metodologia</h2>
<p>${escaparHtml(DESCRICAO_DO_PERFIL[relatorio.perfil])}</p>
<table>
<tbody>
<tr><th>Ambiente avaliado (homologação)</th><td>${escaparHtml(escopo.urlDeHomologacao)}</td></tr>
<tr><th>Domínio de produção (bloqueado)</th><td>${escaparHtml(escopo.dominioDeProducao)}</td></tr>
<tr><th>Requisições permitidas</th><td>${escopo.requisicoesPermitidas}</td></tr>
<tr><th>Requisições bloqueadas pelo Guardião</th><td>${escopo.requisicoesBloqueadas}</td></tr>
</tbody>
</table>
<p>Toda requisição passa pelo Guardião, que só permite o host de homologação cadastrado e bloqueia o domínio de produção e destinos internos. Nenhum teste foi feito em produção.</p>

<footer>Relatório ${escaparHtml(relatorio.id)} &middot; Avaliação ${escaparHtml(relatorio.avaliacaoId)}</footer>
</main>
</body>
</html>
`;
};
