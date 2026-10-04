import { it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "election launch & teste-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "dist/server"), { recursive: true });
  for (const name of ["launch-official.mjs", "setup-core.mjs"])
    copyFileSync(join("scripts", name), join(root, "scripts", name));
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port");
  await new Promise<void>((r) => server.close(() => r()));
  writeFileSync(
    join(root, ".env"),
    `DATA_MODE=tse-sim\nHOST=192.0.2.99\nPORT=${address.port}\n`,
  );
  writeFileSync(
    join(root, "dist/server/main.js"),
    `require('node:http').createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({server:'ok',dataMode:process.env.DATA_MODE,host:process.env.HOST,source:process.env.TSE_HOST}));}).listen(Number(process.env.PORT),process.env.HOST);`,
  );
  return { root, base: `http://127.0.0.1:${address.port}` };
}
function launch(root: string) {
  return spawn(process.execPath, [join(root, "scripts/launch-official.mjs")], {
    cwd: tmpdir(),
    env: { ...process.env, DATA_MODE: "mock", ELECTION_NO_BROWSER: "1" },
    stdio: "ignore",
  });
}
function exit(child: ChildProcess) {
  return new Promise<number | null>((resolve) => child.once("exit", resolve));
}
it("atalho força oficial, recupera IP antigo e reutiliza servidor sem duplicação", async () => {
  const { root, base } = await fixture();
  const child = launch(root);
  const ended = exit(child);
  try {
    let health;
    for (let i = 0; i < 50; i++) {
      try {
        health = await (await fetch(base + "/health")).json();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    expect(health).toMatchObject({
      server: "ok",
      dataMode: "tse",
      host: "127.0.0.1",
      source: "resultados.tse.jus.br",
    });
    expect(await exit(launch(root))).toBe(0);
    expect(readFileSync(join(root, "data/startup.log"), "utf8")).toContain(
      "Reutilizando",
    );
  } finally {
    child.kill("SIGTERM");
    await ended;
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
it("falha inicial termina com erro gravado sem loop infinito", async () => {
  const { root } = await fixture();
  try {
    writeFileSync(join(root, ".env"), "PORT=incorreta\n");
    expect(await exit(launch(root))).toBe(1);
    expect(readFileSync(join(root, "data/startup.log"), "utf8")).toContain(
      "PORT invalida",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
