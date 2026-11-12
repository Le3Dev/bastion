import { expect, test, type Page } from "@playwright/test";

// Dados do semeador (`pnpm banco:semear`). Só roda contra o alvo de teste local.
const SENHA = "bastion-demo-123";
const SISTEMA = "Alvo de teste local";

const entrar = async (page: Page, email: string): Promise<void> => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/painel");
  await expect(page.getByRole("heading", { name: "Painel", level: 1 })).toBeVisible();
};

test("fluxo principal: entrar, verificar, avaliar, abrir o relatório e confirmar um achado", async ({ page }) => {
  // 1. Login
  await entrar(page, "dono@exemplo.com.br");

  // 2. Sistemas: verifica a propriedade do alvo, se ainda não estiver verificado
  await page.goto("/sistemas");
  const linhaDoSistema = page.getByRole("row", { name: new RegExp(SISTEMA) });
  await expect(linhaDoSistema).toBeVisible();
  const botaoDeVerificar = linhaDoSistema.getByRole("button", { name: "Verificar agora" });
  if (await botaoDeVerificar.isVisible()) {
    await botaoDeVerificar.click();
    await expect(linhaDoSistema.getByText("Verificado", { exact: true })).toBeVisible({ timeout: 40_000 });
  } else {
    await expect(linhaDoSistema.getByText("Verificado", { exact: true })).toBeVisible();
  }

  // 3. Nova avaliação
  await page.goto("/avaliacoes/nova");
  await page.getByLabel("Sistema", { exact: true }).selectOption({ label: SISTEMA });
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  await page.waitForURL(/\/avaliacoes\/[0-9a-f-]{36}$/);

  // 4. Tela ao vivo até o estado final
  await expect(page.locator(".tag").filter({ hasText: /^Concluída$/ })).toBeVisible({ timeout: 90_000 });

  // 5. Há achados
  await expect(page.getByText(/Strict-Transport-Security|HSTS/i).first()).toBeVisible();

  // 6. Relatório com nota
  await page.getByRole("link", { name: "Ver relatório" }).click();
  await page.waitForURL(/\/relatorios\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel(/Nota de segurança \d+ de 100/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar PDF" })).toBeVisible();

  // 7. Abre um achado novo e o confirma (em reexecuções, pode não haver achado "Novo")
  const linhaDeAchadoNovo = page
    .getByRole("row")
    .filter({ has: page.locator(".tag").filter({ hasText: /^Novo$/ }) })
    .first();
  if ((await linhaDeAchadoNovo.count()) > 0) {
    await linhaDeAchadoNovo.getByRole("link", { name: "Abrir" }).click();
    await page.waitForURL(/\/achados\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByText('Estado alterado para "Confirmado".')).toBeVisible();
    await expect(page.locator(".tag").filter({ hasText: /^Confirmado$/ }).first()).toBeVisible();
  } else {
    await page.getByRole("row").getByRole("link", { name: "Abrir" }).first().click();
    await page.waitForURL(/\/achados\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Evidência" })).toBeVisible();
  }
});

test("o Leitor entra, mas não consegue iniciar uma avaliação", async ({ page }) => {
  await entrar(page, "leitor@exemplo.com.br");
  await page.goto("/avaliacoes/nova");
  await expect(page.getByRole("button", { name: "Iniciar avaliação" })).toBeDisabled();
});
