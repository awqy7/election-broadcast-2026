import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/studio");
  await page.getByLabel("Chave de acesso").fill("e2e-access-key-123456");
  await page.getByRole("button", { name: "Entrar no Studio" }).click();
  await expect(
    page.getByRole("heading", { name: "Controle de apuração" }),
  ).toBeVisible();
  await command(page, "/api/preview", {
    scene: "top",
    scope: "municipality",
    officeCode: "0003",
    selectedCandidateIds: [],
    topCount: 4,
    position: "bottom-center",
    scale: 1,
    showParty: true,
    showPhoto: true,
    showVotes: true,
    showTimestamp: true,
    safeArea: 60,
  });
  await command(page, "/api/settings", {
    stationName: "",
    stationLogo: null,
    primaryColor: "#0752a0",
  });
  const data = await (await page.request.get("/api/studio")).json();
  if (data.program.state.hold) await command(page, "/api/broadcast/hold", {});
  for (const id of data.favorites)
    await command(page, "/api/favorites", { id });
  await command(page, "/api/broadcast/clear", {});
}
async function command(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Studio-Request": "1",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    { path, body },
  );
}
test("Studio → TAKE → SSE → cenas, HOLD, busca, CLEAR e reconexão", async ({
  page,
  context,
}) => {
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/mock", { action: "online" });
  await command(page, "/api/mock", { action: "progress:50" });
  await page.screenshot({ path: "test-results/studio-1920x1080.png" });
  const output = await context.newPage();
  await output.goto("/overlay/program");
  await page.getByRole("button", { name: "TOP 4", exact: false }).click();
  await page.getByRole("button", { name: "TAKE COLOCAR NO AR" }).click();
  await expect(output.locator('[data-scene="top"]')).toBeVisible();
  expect(
    await output
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("searchbox").fill("simulada a");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "INDIVIDUAL", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "TAKE COLOCAR NO AR" }).click();
  await expect(output.locator('[data-scene="candidate"]')).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await page
    .getByRole("button", { name: "COMPARAR", exact: true })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "COMPARAR", exact: true })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "TAKE COLOCAR NO AR" }).click();
  await expect(output.locator(".compare-candidate")).toHaveCount(2);
  await page
    .getByRole("button", { name: "HOLD · CONGELAR CONTEÚDO", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "LIBERAR HOLD", exact: true }),
  ).toBeVisible();
  const before = await output
    .locator(".compare-candidate")
    .first()
    .textContent();
  await command(page, "/api/mock", { action: "a" });
  await expect(output.locator(".compare-candidate").first()).toHaveText(
    before!,
  );
  await page.getByRole("button", { name: "LIBERAR HOLD", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "HOLD · CONGELAR CONTEÚDO", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(output.locator('[data-scene="compare"]')).toBeVisible();
  await context.setOffline(false);
  await command(page, "/api/preview", { scene: "progress" });
  await command(page, "/api/broadcast/take", {});
  await expect(output.locator('[data-scene="progress"]')).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "CLEAR RETIRAR" }).click();
  await expect(output.locator(".broadcast-module")).toHaveCount(0);
});
test("goldens 1080p de cinco overlays e transparência", async ({ page }) => {
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/mock", { action: "online" });
  await command(page, "/api/mock", { action: "progress:50" });
  await command(page, "/api/preview", {
    scene: "top",
    scope: "municipality",
    officeCode: "0003",
    position: "bottom-center",
    scale: 1,
    topCount: 4,
    showTimestamp: false,
    showPhoto: true,
    showParty: true,
    showVotes: true,
  });
  await command(page, "/api/broadcast/take", {});
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [route, name] of [
    ["top", "top4"],
    ["candidate", "candidate"],
    ["compare", "compare2"],
    ["progress", "progress"],
    ["ticker", "ticker"],
  ]) {
    await page.goto("/overlay/" + route);
    await expect(page.locator(".broadcast-module")).toBeVisible();
    await expect(page).toHaveScreenshot(name + ".png", {
      animations: "disabled",
      omitBackground: true,
    });
  }
  await page.goto("/overlay/top");
  for (const width of [960, 634, 480]) {
    await page.setViewportSize({ width, height: Math.round((width * 9) / 16) });
    await expect(page.locator(".broadcast-module")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/legibility-${width}.png` });
  }
});

test("preview recupera visibilidade quando uma transição é cancelada", async ({
  page,
}) => {
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/mock", { action: "progress:50" });
  await command(page, "/api/preview", { scene: "top" });
  const frame = page.frameLocator("iframe");
  await expect(frame.locator('[data-scene="top"]')).toBeVisible();
  await expect(frame.locator(".module-anchor")).toHaveCSS("opacity", "1");
  await command(page, "/api/preview", { scene: "progress" });
  await expect(frame.locator(".module-anchor")).toHaveClass(/scene-leave/);
  await command(page, "/api/preview", { scene: "top" });
  await expect(frame.locator('[data-scene="top"]')).toBeVisible();
  await expect(frame.locator(".module-anchor")).toHaveCSS("opacity", "1");
});

test("botões refletem a função: Individual, Comparar, favoritos e composição", async ({
  page,
}) => {
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/mock", { action: "progress:50" });
  await command(page, "/api/preview", {
    scene: "top",
    scope: "municipality",
    officeCode: "0003",
    selectedCandidateIds: [],
  });
  const rows = page.locator("tbody tr");
  const first = rows.nth(0);
  const individual = first.getByRole("button", {
    name: "INDIVIDUAL",
    exact: true,
  });
  const compare = first.getByRole("button", { name: "COMPARAR", exact: true });
  const preview = page.frameLocator("iframe");
  await individual.click();
  await expect(individual).toHaveAttribute("aria-pressed", "true");
  await expect(compare).toHaveAttribute("aria-pressed", "false");
  await expect(preview.locator('[data-scene="candidate"]')).toBeVisible();
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await expect(individual).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Limpar seleção" }),
  ).toContainText("1/4");
  await rows
    .nth(1)
    .getByRole("button", { name: "COMPARAR", exact: true })
    .click();
  await expect(preview.locator(".compare-candidate")).toHaveCount(2);
  await rows
    .nth(2)
    .getByRole("button", { name: "COMPARAR", exact: true })
    .click();
  await rows
    .nth(3)
    .getByRole("button", { name: "COMPARAR", exact: true })
    .click();
  await rows
    .nth(4)
    .getByRole("button", { name: "COMPARAR", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("quatro candidatos");
  await expect(preview.locator(".compare-candidate")).toHaveCount(4);
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "false");
  await expect(preview.locator(".compare-candidate")).toHaveCount(3);
  await page
    .locator(".scene-selector")
    .getByRole("button", { name: "INDIVIDUAL" })
    .click();
  await expect(
    page.getByRole("button", { name: "Limpar seleção" }),
  ).toContainText("1/4");
  const favorite = first.getByRole("button", { name: /Favoritar/ });
  if ((await favorite.getAttribute("aria-pressed")) === "true")
    await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "★ Favoritos", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "★ Favoritos", exact: true }).click();
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(
    page.getByRole("button", { name: "Limpar seleção" }),
  ).toContainText("0/4");
  await page
    .getByRole("combobox", { name: "Candidatos", exact: true })
    .selectOption("6");
  await page
    .locator(".scene-selector")
    .getByRole("button", { name: "TOP 6" })
    .click();
  await expect(preview.locator(".candidate-row")).toHaveCount(6);
  await page
    .getByRole("combobox", { name: "Posição", exact: true })
    .selectOption("top-left");
  await page
    .getByRole("combobox", { name: "Escala", exact: true })
    .selectOption("0.5");
  for (const name of ["Partido", "Votos", "Foto", "Horário"]) {
    const checkbox = page.getByRole("checkbox", { name, exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  }
  await page
    .getByRole("spinbutton", { name: "Margem segura no preview" })
    .fill("90");
  await page
    .locator(".scene-selector")
    .getByRole("button", { name: "APURAÇÃO" })
    .click();
  await expect(preview.locator('[data-scene="progress"]')).toBeVisible();
  await page
    .locator(".scene-selector")
    .getByRole("button", { name: "TICKER" })
    .click();
  await expect(preview.locator('[data-scene="ticker"]')).toBeVisible();
  await page.keyboard.press("1");
  await expect(preview.locator('[data-scene="top"]')).toBeVisible();
  await page.getByRole("combobox", { name: "Abrangência" }).selectOption("br");
  await expect(
    page.getByRole("combobox", { name: "Cargo", exact: true }),
  ).toHaveValue("0001");
  // Nao deve existir nenhum controle que fale com o vMix: o sistema so
  // entrega as duas abas com as URLs.
  await expect(page.getByRole("button", { name: /VMIX/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Abrir a saída/ })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar no Studio" }),
  ).toBeVisible();
});

test("identidade, logo, diagnóstico e backup pelos controles do Studio", async ({
  page,
}) => {
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/mock", { action: "progress:50" });
  await command(page, "/api/preview", {
    scene: "top",
    scope: "municipality",
    officeCode: "0003",
  });
  await page.getByRole("button", { name: "Configuração", exact: true }).click();
  await page.getByLabel("Nome da emissora").fill("Emissora de teste");
  await page.getByLabel("Cor principal").fill("#184877");
  await page.getByLabel("Logo (PNG, JPEG ou WebP, até 2 MB)").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0YQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByRole("img", { name: "Logo da emissora" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome da emissora")).toHaveValue(
    "Emissora de teste",
  );
  await page
    .getByRole("button", { name: "Salvar identidade", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/settings")).json()).stationName,
    )
    .toBe("Emissora de teste");
  await page.getByRole("button", { name: "Operação", exact: true }).click();
  await expect(
    page.frameLocator("iframe").locator(".station-logo"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Configuração", exact: true }).click();
  await page.getByRole("button", { name: "Remover logo", exact: true }).click();
  await page.getByLabel("Nome da emissora").fill("");
  await page.getByLabel("Cor principal").fill("#0752a0");
  await page
    .getByRole("button", { name: "Salvar identidade", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/settings")).json()).stationLogo,
    )
    .toBeNull();
  await page.locator(".technical-panel summary").click();
  await page
    .getByRole("button", { name: "EXECUTAR DIAGNÓSTICO", exact: true })
    .click();
  await expect(page.locator(".diagnostic-row")).toHaveCount(6);
  await expect(page.locator(".diagnostic-FAIL")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^election-backup-.*\.zip$/);
});

test("painel mock executa votos, progresso, falhas e situações", async ({
  page,
}) => {
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/preview", {
    scene: "top",
    scope: "municipality",
    officeCode: "0003",
    selectedCandidateIds: [],
  });
  await page.getByRole("button", { name: "Ensaio", exact: true }).click();
  async function press(name: string) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/mock") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name, exact: true }).click();
    const r = await response;
    expect(r.ok()).toBe(true);
    return r.json();
  }
  async function output() {
    return (await (await page.request.get("/api/output?preview=1")).json())
      .result;
  }
  for (const n of [0, 3, 12, 25, 50, 75, 99, 100]) {
    await press(`${n}% apurado`);
    expect((await output()).percentageSectionsTotalized).toBe(n);
  }
  for (const [name, letter] of [
    ["+ votos candidato A", "A"],
    ["+ votos candidato B", "B"],
  ]) {
    const before = (await output()).candidates.find(
      (c: { ballotName: string }) => c.ballotName.endsWith(letter),
    ).votes;
    await press(name);
    expect(
      (await output()).candidates.find((c: { ballotName: string }) =>
        c.ballotName.endsWith(letter),
      ).votes,
    ).toBe(before + 1000);
  }
  const leader = (await output()).candidates[0].id;
  await press("Trocar líder");
  expect((await output()).candidates[0].id).not.toBe(leader);
  for (const [name, error] of [
    ["TSE OFFLINE", "TSE_HTTP_ERROR"],
    ["JSON INVÁLIDO", "TSE_SCHEMA_INVALID"],
    ["JSON PARCIAL", "TSE_SCHEMA_INVALID"],
    ["TIMEOUT", "TSE_TIMEOUT"],
  ]) {
    const before = (await output()).hash;
    expect((await press(name)).error).toContain(error);
    expect((await output()).hash).toBe(before);
    expect((await press("TSE ONLINE")).error).toBeNull();
  }
  await press("FOTO AUSENTE");
  expect((await output()).candidates[0].photoUrl).toContain(
    "missing-simulated",
  );
  await press("CANDIDATO SUBSTITUÍDO");
  expect(
    (await output()).candidates.some(
      (c: { substitutes: unknown[] }) => c.substitutes.length,
    ),
  ).toBe(true);
  await press("ANULADO");
  expect(
    (await output()).candidates.some(
      (c: { destination: string }) => c.destination === "Anulado",
    ),
  ).toBe(true);
  await press("ANULADO SUB JUDICE");
  expect(
    (await output()).candidates.some(
      (c: { destination: string }) => c.destination === "Anulado sub judice",
    ),
  ).toBe(true);
  await press("SEGUNDO TURNO");
  expect(
    (await output()).candidates.some(
      (c: { officialStatus: string }) => c.officialStatus === "2º turno",
    ),
  ).toBe(true);
  expect((await press("PAUSAR / RETOMAR PROGRESSÃO")).auto).toBe(true);
  expect((await press("PAUSAR / RETOMAR PROGRESSÃO")).auto).toBe(false);
  await command(page, "/api/mock", { action: "reset" });
});

test("overlay sem Array.at mantém cenas e SSE em navegador incorporado antigo", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Reflect.deleteProperty(Array.prototype, "at");
  });
  await login(page);
  await command(page, "/api/mock", { action: "reset" });
  await command(page, "/api/mock", { action: "progress:50" });
  await command(page, "/api/preview", { scene: "top" });
  await command(page, "/api/broadcast/take", {});
  const output = await context.newPage();
  const errors: string[] = [];
  output.on("pageerror", (e) => errors.push(e.message));
  await output.goto("/overlay/program");
  await expect(output.locator('[data-scene="top"]')).toBeVisible();
  await expect(output.locator(".candidate-row")).toHaveCount(4);
  await output.screenshot({
    path: "test-results/overlay-compatibility.png",
    omitBackground: true,
  });
  await command(page, "/api/preview", { scene: "progress" });
  await command(page, "/api/broadcast/take", {});
  await expect(output.locator('[data-scene="progress"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("diagnóstico diferencia rede e programa fora do ar sem depender do bundle", async ({
  page,
  context,
}) => {
  await login(page);
  await command(page, "/api/broadcast/clear", {});
  const check = await context.newPage();
  await check.goto("/overlay/check");
  await expect(check.locator("#javascript")).toHaveText("JavaScript: OK");
  await expect(check.locator("#http")).toHaveText("Servidor HTTP: OK");
  await expect(check.locator("#events")).toContainText("Conexão SSE: OK");
  await expect(check.locator("#program")).toContainText("FORA DO AR");
  await command(page, "/api/preview", { scene: "top" });
  await command(page, "/api/broadcast/take", {});
  await expect(check.locator("#program")).toContainText("NO AR");
});
