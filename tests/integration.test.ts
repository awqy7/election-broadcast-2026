import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../apps/server/app";
const opened: Awaited<ReturnType<typeof createApp>>[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const x of opened.splice(0)) await x.app.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function setup() {
  const dataDirectory = mkdtempSync(join(tmpdir(), "election-app-"));
  dirs.push(dataDirectory);
  const x = await createApp({
    mode: "mock",
    dataDirectory,
    adminKey: "test-key-1234567890",
    startScheduler: false,
    logger: false,
  });
  opened.push(x);
  await x.engine.poll();
  return x;
}
async function login(x: Awaited<ReturnType<typeof setup>>) {
  const r = await x.app.inject({
    method: "POST",
    url: "/api/login",
    headers: { "x-studio-request": "1" },
    payload: { key: "test-key-1234567890" },
  });
  expect(r.statusCode).toBe(200);
  return {
    cookie: r.cookies[0].name + "=" + r.cookies[0].value,
    "x-studio-request": "1",
  };
}
describe("Motor → cache → API → SSE", () => {
  it("ingestão, falhas e comando conservam último resultado", async () => {
    const x = await setup();
    const headers = await login(x);
    const previous = x.broadcast.output(true).result!;
    expect(previous.candidates.length).toBe(6);
    x.engine.mock.invalid = true;
    await x.engine.poll();
    expect(x.broadcast.output(true).result!.hash).toBe(previous.hash);
    expect(x.engine.lastError).toContain("TSE_SCHEMA_INVALID");
    x.engine.mock.invalid = false;
    await x.app.inject({
      method: "POST",
      url: "/api/preview",
      headers,
      payload: { scene: "progress" },
    });
    const take = await x.app.inject({
      method: "POST",
      url: "/api/broadcast/take",
      headers,
      payload: {},
    });
    expect(take.json().state.scene).toBe("progress");
    expect(take.json().state.visible).toBe(true);
    const exported = await x.app.inject({ url: "/api/admin/export", headers });
    expect(exported.headers["content-type"]).toContain("zip");
    expect(exported.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });
  it("autenticação, origem, preview e mutações protegidas", async () => {
    const x = await setup();
    expect((await x.app.inject("/api/output")).statusCode).toBe(200);
    expect((await x.app.inject("/api/output?preview=1")).statusCode).toBe(401);
    expect((await x.app.inject("/api/studio")).statusCode).toBe(401);
    const headers = await login(x);
    expect(
      (
        await x.app.inject({
          method: "POST",
          url: "/api/broadcast/take",
          headers: { ...headers, origin: "https://evil.test" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await x.app.inject({
          method: "POST",
          url: "/api/preview",
          headers,
          payload: { revision: 999 },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("snapshot inicial SSE e retomada entregam programa persistido", async () => {
    const x = await setup();
    const address = await x.app.listen({ port: 0, host: "127.0.0.1" });
    x.broadcast.take();
    const controller = new AbortController();
    const response = await fetch(address + "/api/events", {
      signal: controller.signal,
      headers: { "Last-Event-ID": "old:999999" },
    });
    const reader = response.body!.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value);
    expect(chunk).toContain("event: connection");
    expect(chunk).toContain('"visible":true');
    controller.abort();
    await reader.cancel().catch(() => {});
  });
  it("reinício recupera SQLite sem ingestor executar", async () => {
    const x = await setup();
    x.broadcast.update({ scene: "progress" });
    x.broadcast.take();
    const path = x.dataRoot;
    await x.app.close();
    opened.splice(opened.indexOf(x), 1);
    const y = await createApp({
      mode: "mock",
      dataDirectory: path,
      adminKey: "test-key-1234567890",
      startScheduler: false,
      logger: false,
    });
    opened.push(y);
    expect(y.broadcast.program.scene).toBe("progress");
    expect(y.broadcast.output().result?.candidates.length).toBe(6);
  });
});

it("oficial e simulado TSE isolam banco, configuração e sessão; mutações mock bloqueadas", async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), "election-isolation-"));
  dirs.push(dataDirectory);
  const official = await createApp({
    mode: "tse",
    dataDirectory,
    adminKey: "test-key-1234567890",
    startScheduler: false,
    logger: false,
  });
  const simulation = await createApp({
    mode: "tse-sim",
    dataDirectory,
    adminKey: "test-key-1234567890",
    startScheduler: false,
    logger: false,
  });
  opened.push(official, simulation);
  expect(official.engine.config.environment).toBe("oficial");
  expect(simulation.engine.config.environment).toBe("simulado2026");
  expect(simulation.engine.urls().ea11()).toContain(
    "resultados-sim.tse.jus.br/simulado/simulado2026",
  );
  simulation.broadcast.update({ scene: "ticker" });
  expect(official.broadcast.preview.scene).toBe("top");
  const officialHeaders = await login(official);
  const simHeaders = await login(simulation);
  expect(officialHeaders.cookie.split("=")[0]).not.toBe(
    simHeaders.cookie.split("=")[0],
  );
  expect(
    (await official.app.inject({ url: "/api/studio", headers: simHeaders }))
      .statusCode,
  ).toBe(401);
  for (const [app, headers] of [
    [official.app, officialHeaders],
    [simulation.app, simHeaders],
  ] as const) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/mock",
          headers,
          payload: { action: "a" },
        })
      ).statusCode,
    ).toBe(400);
  }
});
