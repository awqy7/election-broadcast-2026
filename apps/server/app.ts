import { DiagnosticsService } from "../../packages/core/diagnostics";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { z } from "zod";
import {
  APP_ROOT,
  DATA_ROOT,
  WEB_ROOT,
  webRootExists,
} from "../../packages/core/paths";
import { SnapshotRepository } from "../../packages/core/repository";
import { FreshnessMonitor } from "../../packages/core/freshness";
import { TseHttpClient, RateLimiter } from "../../packages/tse/http";
import { TseIngestionService } from "../../packages/tse/ingestion";
import { BroadcastStateService } from "../../packages/broadcast/state";
import { SseHub } from "../../packages/broadcast/sse";
import { hash } from "../../packages/tse/normalizer";
import { settingsSchema } from "../../packages/shared";
export interface AppOptions {
  mode?: "mock" | "tse" | "tse-sim";
  dataDirectory?: string;
  adminKey?: string;
  startScheduler?: boolean;
  logger?: boolean;
}
export async function createApp(options: AppOptions = {}) {
  const mode =
    options.mode ??
    z.enum(["mock", "tse", "tse-sim"]).parse(process.env.DATA_MODE ?? "tse");
  const dataRoot = options.dataDirectory
    ? resolve(options.dataDirectory)
    : DATA_ROOT;
  const directory = resolve(dataRoot, mode);
  mkdirSync(directory, { recursive: true });
  mkdirSync(resolve(directory, "cache/photos"), { recursive: true });
  mkdirSync(resolve(directory, "assets"), { recursive: true });
  let key = options.adminKey ?? process.env.ADMIN_ACCESS_KEY;
  if (!key) {
    const path = resolve(dataRoot, "admin-access-key.txt");
    if (existsSync(path)) key = readFileSync(path, "utf8").trim();
    else {
      key = randomBytes(24).toString("base64url");
      writeFileSync(path, key, { mode: 0o600 });
    }
  }
  if (key.length < 16)
    throw new Error("ADMIN_ACCESS_KEY precisa de 16 caracteres");
  const adminHash = hash(key);
  const sessions = new Map<string, number>();
  const sessionCookie = `election_${mode.replaceAll("-", "_")}`;
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 2_500_000,
    // Atrás de um proxy que termina TLS (Nginx, Caddy, Cloudflare) o host
    // original chega em X-Forwarded-Proto. Sem isso o cookie de sessão não
    // receberia Secure e o rate limit por IP passaria a contar o proxy.
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  const repo = new SnapshotRepository(resolve(directory, "election.db"));
  const http = new TseHttpClient(
    repo,
    new RateLimiter(
      z.coerce
        .number()
        .finite()
        .int()
        .min(500)
        .max(60000)
        .parse(process.env.TSE_MIN_REQUEST_INTERVAL_MS ?? 1000),
    ),
    z.coerce
      .number()
      .finite()
      .int()
      .min(500)
      .max(30000)
      .parse(process.env.TSE_TIMEOUT_MS ?? 8000),
  );
  const engine: TseIngestionService = new TseIngestionService(
    mode,
    repo,
    http,
    {
      host:
        mode === "tse-sim"
          ? "resultados-sim.tse.jus.br"
          : (process.env.TSE_HOST ?? "resultados.tse.jus.br"),
      uf: process.env.DEFAULT_UF ?? "mg",
      municipalityName:
        process.env.DEFAULT_MUNICIPALITY_NAME ?? "Teófilo Otoni",
      interval: z.coerce
        .number()
        .finite()
        .int()
        .min(2500)
        .max(600000)
        .parse(process.env.TSE_POLL_INTERVAL_MS ?? 10000),
      photoDirectory: resolve(directory, "cache/photos"),
    },
    () => broadcast.active(),
    () => broadcast.notify("result-update"),
  );
  const broadcast: BroadcastStateService = new BroadcastStateService(
    repo,
    mode,
    (s) => engine.result(s),
    (event) => hub.publish(event),
  );
  const hub: SseHub = new SseHub((p) => broadcast.output(p));
  const freshness = new FreshnessMonitor();
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 2_000_000, files: 1 } });
  await app.register(rateLimit, {
    max: (req) => (req.method === "GET" ? 1200 : 240),
    timeWindow: "1 minute",
    keyGenerator: (req) =>
      `${req.ip}:${req.method === "GET" ? "read" : "write"}`,
    allowList: (req) =>
      !req.url.startsWith("/api/") && !req.url.startsWith("/health"),
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "same-origin");
    reply.header("Cache-Control", "no-store");
    const url = req.url.split("?")[0];
    const preview =
      new URL(req.url, "http://local").searchParams.get("preview") === "1";
    const protectedRoute =
      (url.startsWith("/api/") &&
        !["/api/events", "/api/output", "/api/login"].includes(url)) ||
      preview;
    const session = req.cookies[sessionCookie];
    const authenticated =
      !!session && (sessions.get(session) ?? 0) > Date.now();
    if (protectedRoute && !authenticated)
      return reply.code(401).send({ error: "Autenticação necessária" });
    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host)
        return reply.code(403).send({ error: "Origem não permitida" });
      if (!req.headers["x-studio-request"])
        return reply
          .code(403)
          .send({ error: "Cabeçalho do Studio obrigatório" });
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 400;
    app.log.warn({ error: message }, "Comando rejeitado");
    reply.code(status).send({ error: message });
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { key } = z.object({ key: z.string().max(200) }).parse(req.body);
      if (!timingSafeEqual(Buffer.from(hash(key)), Buffer.from(adminHash)))
        return reply.code(401).send({ error: "Chave inválida" });
      for (const [s, expires] of sessions)
        if (expires < Date.now()) sessions.delete(s);
      const session = randomBytes(32).toString("base64url");
      sessions.set(session, Date.now() + 16 * 3600000);
      reply.setCookie(sessionCookie, session, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 16 * 3600,
        secure: req.protocol === "https",
      });
      return { ok: true };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    sessions.delete(req.cookies[sessionCookie] ?? "");
    reply.clearCookie(sessionCookie, { path: "/" });
    return { ok: true };
  });
  app.get("/api/studio", async () => ({
    preview: broadcast.output(true),
    program: broadcast.output(),
    favorites: broadcast.favorites,
    municipality: engine.municipality,
  }));
  app.get("/api/output", async (req) =>
    broadcast.output((req.query as { preview?: string }).preview === "1"),
  );
  app.post("/api/preview", async (req) => {
    const state = broadcast.update(req.body);
    void engine.poll();
    return state;
  });
  app.post("/api/broadcast/:action", async (req) => {
    const action = z
      .enum(["take", "clear", "hold"])
      .parse((req.params as { action: string }).action);
    broadcast[action]();
    return broadcast.output();
  });
  app.post("/api/favorites", async (req) =>
    broadcast.favorite(z.object({ id: z.string().max(40) }).parse(req.body).id),
  );
  app.post("/api/photos", () => {
    if (mode === "mock") throw new Error("Fotos TSE indisponíveis no mock");
    engine.preparePhotos(broadcast.preview, true);
    return engine.photos.summary(
      engine.result(broadcast.preview)?.candidates ?? [],
    );
  });
  app.get("/api/settings", async () => broadcast.settings);
  app.post("/api/settings", async (req) => {
    broadcast.saveSettings(settingsSchema.parse(req.body));
    return broadcast.settings;
  });
  app.post("/api/settings/logo", async (req) => {
    const file = await req.file();
    if (!file) throw new Error("Selecione um arquivo");
    const data = await file.toBuffer();
    const extension = data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : data[0] === 255 && data[1] === 216
        ? "jpeg"
        : data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!extension) throw new Error("Use PNG, JPEG ou WebP");
    const name = `logo-${hash(data)}.${extension}`;
    writeFileSync(resolve(directory, "assets", name), data);
    broadcast.saveSettings({
      ...broadcast.settings,
      stationLogo: `/branding/${name}`,
    });
    return broadcast.settings;
  });
  app.get("/api/events", async (req, reply) => {
    if (hub.clients.size >= 80)
      return reply.code(503).send({ error: "Limite de conexões SSE" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    hub.add(reply.raw, (req.query as { preview?: string }).preview === "1");
  });
  const health = async () => {
    const database =
      (repo.db.prepare("PRAGMA quick_check").get() as { quick_check: string })
        .quick_check === "ok"
        ? "ok"
        : "error";
    return {
      server: "ok",
      database,
      node: process.version,
      paths: { appRoot: APP_ROOT, dataRoot, webRoot: WEB_ROOT },
      tse:
        mode === "mock"
          ? "simulation"
          : engine.lastError
            ? "error"
            : http.metrics.lastSuccessAt
              ? "ok"
              : "waiting",
      dataMode: mode,
      photos: engine.photos.summary(
        engine.result(broadcast.preview)?.candidates ?? [],
      ),
      lastFetchAt:
        mode === "mock" ? engine.lastResultSuccessAt : http.metrics.lastFetchAt,
      lastChangedAt: engine.lastResultChangedAt,
      lastSnapshotAt:
        [...engine.results.values()]
          .map((r) => r.receivedAt)
          .sort()
          .at(-1) ?? null,
      freshness: freshness.state(
        engine.lastResultSuccessAt,
        engine.lastResultChangedAt,
      ),
      sseClients: hub.clients.size,
      overlayClients: [...hub.clients.values()].filter((p) => !p).length,
      previewClients: [...hub.clients.values()].filter(Boolean).length,
      error: engine.lastError,
      sourceErrors: Object.fromEntries(engine.sourceErrors),
      metrics: {
        ...http.metrics,
        averageLatency: http.metrics.fetchCount
          ? Math.round(http.metrics.totalLatency / http.metrics.fetchCount)
          : 0,
      },
      configValidated: engine.config.validated,
      municipality: engine.municipality,
    };
  };
  app.get("/health", health);
  const diagnostics = new DiagnosticsService({
    mode,
    repo,
    directory,
    engine,
    http,
    broadcast,
    hub,
  });
  app.post("/api/diagnostics", () => diagnostics.run());
  app.post("/api/mock", async (req) => {
    if (mode !== "mock")
      throw new Error("Painel disponível apenas em simulação");
    const action = z
      .object({
        action: z.enum([
          "reset",
          "a",
          "b",
          "swap",
          "progress:0",
          "progress:3",
          "progress:12",
          "progress:25",
          "progress:48",
          "progress:50",
          "progress:67",
          "progress:75",
          "progress:82",
          "progress:95",
          "progress:99",
          "progress:100",
          "offline",
          "online",
          "invalid",
          "partial",
          "timeout",
          "photo",
          "substitute",
          "annulled",
          "subjudice",
          "runoff",
          "pause",
        ]),
      })
      .parse(req.body).action;
    engine.mock.command(action);
    repo.audit("MOCK_CONTROL", {}, { action });
    await engine.poll();
    hub.publish("warning");
    return { ok: true, error: engine.lastError, auto: engine.mock.auto };
  });
  app.get("/api/admin/export", async (_req, reply) => {
    const file = resolve(
      directory,
      `backup-${randomBytes(5).toString("hex")}.db`,
    );
    try {
      await repo.db.backup(file);
      const bytes = zipSync({
        "election.db": readFileSync(file),
        "settings.json": strToU8(JSON.stringify(broadcast.settings, null, 2)),
        "snapshots.json": strToU8(
          JSON.stringify([...engine.results.values()], null, 2),
        ),
        "fetch-log.json": strToU8(
          JSON.stringify(
            repo.db
              .prepare("SELECT * FROM fetch_log ORDER BY id DESC LIMIT 1000")
              .all(),
          ),
        ),
        "manifest.json": strToU8(
          JSON.stringify({
            mode,
            createdAt: new Date().toISOString(),
            version: 1,
          }),
        ),
      });
      return reply
        .header("Content-Type", "application/zip")
        .header(
          "Content-Disposition",
          `attachment; filename="election-backup-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 13)}.zip"`,
        )
        .send(Buffer.from(bytes));
    } finally {
      if (existsSync(file)) unlinkSync(file);
    }
  });
  await app.register(staticPlugin, {
    root: resolve(directory, "cache/photos"),
    prefix: "/photos/",
    decorateReply: false,
  });
  await app.register(staticPlugin, {
    root: resolve(directory, "assets"),
    prefix: "/branding/",
    decorateReply: false,
  });
  const webRoot = WEB_ROOT;
  if (process.env.DEV_WEB !== "true") {
    if (!webRootExists())
      throw new Error(
        `Interface web ausente em ${webRoot}. Execute pnpm build antes de iniciar.`,
      );
    await app.register(staticPlugin, {
      root: webRoot,
      prefix: "/",
      decorateReply: true,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/photos/"))
        return reply.code(404).send({ error: "Não encontrado" });
      // O painel de controle da simulação não existe fora do modo mock.
      // Bloquear aqui evita mostrar uma tela que não pode funcionar.
      if (mode !== "mock" && req.url.split("?")[0] === "/test")
        return reply
          .code(404)
          .type("text/plain; charset=utf-8")
          .send(
            "404 - Pagina de ensaio disponivel apenas no modo de simulacao local.",
          );
      return reply
        .type("text/html")
        .send(readFileSync(resolve(webRoot, "index.html")));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.addHook("onClose", async () => vite.close());
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply.code(404).send({ error: "Não encontrado" });
      reply.hijack();
      vite.middlewares(req.raw, reply.raw, () => {
        reply.raw.statusCode = 404;
        reply.raw.end();
      });
    });
  }
  app.addHook("onClose", async () => {
    hub.close();
    await engine.close();
    repo.close();
  });
  if (options.startScheduler !== false) void engine.start();
  return { app, repo, engine, broadcast, hub, health, dataRoot };
}
