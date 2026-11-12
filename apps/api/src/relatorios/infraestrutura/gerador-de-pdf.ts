import { chromium } from 'playwright';
import { ErroDeAplicacao } from '../../compartilhado/erros';

export const MENSAGEM_DE_PDF_INDISPONIVEL =
  'Geração de PDF indisponível: rode `pnpm --filter @bastion/api exec playwright install chromium`.';

export type RenderizadorDePdf = (html: string) => Promise<Uint8Array>;

export const pdfIndisponivel = (): ErroDeAplicacao =>
  new ErroDeAplicacao(503, 'PDF_INDISPONIVEL', MENSAGEM_DE_PDF_INDISPONIVEL);

/**
 * Converte o HTML em PDF A4 com o Chromium do Playwright. Toda requisição de rede é abortada:
 * o relatório é autocontido e o navegador nunca chega à internet.
 */
export const renderizarPdf: RenderizadorDePdf = async (html) => {
  let navegador: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    navegador = await chromium.launch();
  } catch {
    throw pdfIndisponivel();
  }
  try {
    const pagina = await navegador.newPage();
    await pagina.route('**/*', (rota) => rota.abort());
    await pagina.setContent(html, { waitUntil: 'load' });
    return await pagina.pdf({ format: 'A4', printBackground: true });
  } finally {
    await navegador.close();
  }
};
