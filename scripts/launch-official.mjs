import { spawn, spawnSync } from "node:child_process";
import {
  openSync,
  closeSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { parseEnv, buildUrls } from "./setup-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
mkdirSync(join(root, "data"), { recursive: true });
const logPath = join(root, "data", "startup.log");
function log(message) {
  appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  console.log(message);
}
let child;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
async function health(base) {
  try {
    const response = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
async function openTabs(base) {
  log(`Studio OFICIAL: ${base}/studio`);
  log(`Saida OFICIAL: ${base}/overlay/program`);
  log("Chave de acesso: CHAVE-DE-ACESSO.txt na pasta do programa.");
  if (process.platform !== "win32" || process.env.ELECTION_NO_BROWSER === "1")
    return;
  for (const path of ["/studio", "/overlay/program"]) {
    const browser = spawn(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", base + path],
      { stdio: "ignore", detached: true },
    );
    browser.on("error", () =>
      log("Nao foi possivel abrir o navegador. Use os enderecos acima."),
    );
    browser.unref();
  }
}
try {
  if (!existsSync(join(root, ".env"))) {
    log("Primeira execucao: preparando configuracao e banco.");
    const setup = spawnSync(
      process.execPath,
      [join(root, "scripts/setup.mjs"), root],
      { cwd: root, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
    );
    if (setup.status !== 0)
      throw new Error(
        setup.stderr ||
          setup.error?.message ||
          "Falha na configuracao inicial.",
      );
  }
  const config = parseEnv(readFileSync(join(root, ".env"), "utf8"));
  let host = config.get("HOST") || "127.0.0.1";
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .map((i) => i.address);
  if (
    !["127.0.0.1", "localhost", "0.0.0.0", "::", "[::]"].includes(host) &&
    !addresses.includes(host)
  ) {
    log(
      "O IP salvo nao pertence mais a este computador. Usando localhost; ajuste HOST no .env para acesso pela rede.",
    );
    host = "127.0.0.1";
  }
  const port = Number(config.get("PORT") || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT invalida no .env.");
  const base = buildUrls(host, port).base;
  const existing = await health(base);
  if (existing) {
    if (existing.server !== "ok" || existing.dataMode !== "tse")
      throw new Error(
        `A porta ${port} esta ocupada por outro ambiente. Nao foi aberto como oficial.`,
      );
    log("Servidor oficial ja esta ativo. Reutilizando a instancia.");
    await openTabs(base);
  } else {
    log(`Iniciando em modo OFICIAL. Log: ${logPath}`);
    const env = {
      ...process.env,
      ...Object.fromEntries(config),
      HOST: host,
      PORT: String(port),
      DATA_MODE: "tse",
      TSE_HOST: "resultados.tse.jus.br",
      DEV_WEB: "false",
    };
    for (let attempt = 0; attempt < 3 && !stopping; attempt++) {
      let exited = false;
      const logFile = openSync(logPath, "a");
      try {
        child = spawn(process.execPath, [join(root, "dist/server/main.js")], {
          cwd: root,
          env,
          stdio: ["ignore", logFile, logFile],
        });
      } finally {
        closeSync(logFile);
      }
      const done = new Promise((resolve) => {
        child.once("error", (error) => {
          log(`Falha ao iniciar: ${error.message}`);
          exited = true;
          resolve(1);
        });
        child.once("exit", (code) => {
          exited = true;
          resolve(code ?? 1);
        });
      });
      let ready = false;
      for (let i = 0; i < 60 && !exited && !stopping; i++) {
        const status = await health(base);
        if (status?.server === "ok" && status.dataMode === "tse") {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (ready) await openTabs(base);
      else if (!exited) child.kill();
      const code = await done;
      if (stopping || code === 0) break;
      console.error(
        readFileSync(logPath, "utf8").split(/\r?\n/).slice(-8).join("\n"),
      );
      log(`Servidor encerrou com codigo ${code}. Tentativa ${attempt + 1}/3.`);
      if (attempt === 2)
        throw new Error(
          "Servidor nao permaneceu ativo. Consulte data/startup.log; esta janela permanecera aberta.",
        );
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
} catch (error) {
  log(`ERRO: ${error.message}`);
  log(`Envie o arquivo ${logPath} para suporte.`);
  process.exitCode = 1;
}
