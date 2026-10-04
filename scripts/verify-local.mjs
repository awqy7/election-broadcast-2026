import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const base = process.env.VERIFY_URL ?? "http://127.0.0.1:8787";
const key =
  process.env.ADMIN_ACCESS_KEY ||
  readFileSync("data/admin-access-key.txt", "utf8").trim();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function command(path, body) {
  const response = await context.request.post(base + path, {
    headers: { "X-Studio-Request": "1" },
    data: body,
  });
  if (!response.ok()) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
}
mkdirSync("artifacts", { recursive: true });
try {
  await command("/api/login", { key });
  await page.goto(base + "/studio");
  await page.getByRole("heading", { name: "Controle de apuração" }).waitFor();
  const initial = await (
    await context.request.get(base + "/api/studio")
  ).json();
  const overlay = await context.newPage();
  await overlay.goto(base + "/overlay/program");
  const diagnostics = await command("/api/diagnostics", {});
  const scopes = [];
  for (const [scope, officeCode] of [
    ["state", "0003"],
    ["br", "0001"],
    ["municipality", "0001"],
    ["municipality", "0003"],
  ]) {
    await command("/api/preview", {
      scope,
      officeCode,
      scene: "top",
      selectedCandidateIds: [],
    });
    let output;
    for (let attempt = 0; attempt < 40; attempt++) {
      output = await (
        await context.request.get(base + "/api/output?preview=1")
      ).json();
      if (output.result) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    scopes.push({
      scope,
      officeCode,
      result: output.result
        ? {
            scopeName: output.result.scopeName,
            officeName: output.result.officeName,
            source: output.result.source,
            progressStatus: output.result.progressStatus,
            candidates: output.result.candidates.length,
            sourceResource: output.result.sourceResource,
          }
        : null,
    });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .frameLocator("iframe")
    .locator(".scope-title small", { hasText: "Governador" })
    .waitFor();
  await expect(page.frameLocator("iframe").locator(".module-anchor")).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({ path: "artifacts/studio-official-1920x1080.png" });
  if (!initial.program.state.visible && !initial.program.state.hold) {
    await command("/api/broadcast/take", {});
    await overlay.getByText("AGUARDANDO INÍCIO DA TOTALIZAÇÃO").waitFor();
    await expect(overlay.locator(".module-anchor")).toHaveCSS("opacity", "1");
    await overlay.screenshot({
      path: "artifacts/overlay-official-waiting.png",
      omitBackground: true,
    });
    await command("/api/broadcast/clear", {});
  }
  const health = await (await context.request.get(base + "/health")).json();
  const report = {
    verifiedAt: new Date().toISOString(),
    health,
    diagnostics,
    scopes,
    browserErrors: errors,
  };
  writeFileSync(
    "artifacts/local-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        health: {
          server: health.server,
          database: health.database,
          tse: health.tse,
          freshness: health.freshness,
        },
        diagnostics: diagnostics.map((d) => ({
          name: d.name,
          status: d.status,
        })),
        scopes,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  if (
    errors.length ||
    diagnostics.some((d) => d.status === "FAIL") ||
    scopes.some((s) => !s.result)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
