import type { ZodType, ZodTypeDef } from "zod";
import { hash } from "./normalizer";
import { SnapshotRepository } from "../core/repository";
export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
export const backoff = (attempt: number, base = 2500, random = Math.random) =>
  Math.min(600000, base * 2 ** Math.min(attempt, 8)) * (1 + random() * 0.2);
export class RateLimiter {
  private queue = Promise.resolve();
  private next = 0;
  constructor(public interval = 1000) {}
  async acquire() {
    const turn = this.queue.then(async () => {
      await sleep(Math.max(0, this.next - Date.now()));
      this.next = Date.now() + this.interval;
    });
    this.queue = turn.catch(() => {});
    await turn;
  }
}
export class SourceError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
export class TseHttpClient {
  metrics = {
    fetchCount: 0,
    count304: 0,
    count200: 0,
    errors: 0,
    bytesDownloaded: 0,
    totalLatency: 0,
    lastFetchAt: null as string | null,
    lastSuccessAt: null as string | null,
    lastChangedAt: null as string | null,
    lastChangedResource: null as string | null,
    lastError: null as string | null,
  };
  blockedUntil = 0;
  private failures = new Map<string, { count: number; until: number }>();
  private responseLogs = new WeakMap<Response, number>();
  markResponse(
    response: Response,
    changed: boolean,
    error: string | null = null,
  ) {
    const id = this.responseLogs.get(response);
    if (id)
      this.repo.db
        .prepare("UPDATE fetch_log SET changed=?,error=? WHERE id=?")
        .run(Number(changed), error, id);
  }
  constructor(
    public repo: SnapshotRepository,
    public limiter: RateLimiter,
    public timeout = 8000,
    private transport: typeof fetch = fetch,
  ) {}
  async json<T>(
    url: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
  ): Promise<{ data: T; changed: boolean }> {
    const previous = this.repo.cache(url);
    const response = await this.request(url, previous);
    if (response.status === 304) {
      if (!previous) throw new SourceError("TSE_SCHEMA_INVALID");
      return { data: schema.parse(JSON.parse(previous.body)), changed: false };
    }
    try {
      const text = await response.text();
      if (text.length > 25_000_000) throw new Error("Arquivo excede limite");
      const data = schema.parse(JSON.parse(text));
      const changed = !previous || hash(previous.body) !== hash(text);
      this.markResponse(response, changed);
      this.repo.cachePut(
        url,
        response.headers.get("etag"),
        response.headers.get("last-modified"),
        text,
      );
      this.metrics.bytesDownloaded += Buffer.byteLength(text);
      if (changed) {
        this.metrics.lastChangedAt = new Date().toISOString();
        this.metrics.lastChangedResource = url;
      }
      return { data, changed };
    } catch (e) {
      this.metrics.errors++;
      this.metrics.lastError = "TSE_SCHEMA_INVALID";
      this.failures.set(url, { count: 1, until: Date.now() + 30000 });
      this.markResponse(
        response,
        false,
        `TSE_SCHEMA_INVALID: ${String(e).slice(0, 500)}`,
      );
      throw new SourceError("TSE_SCHEMA_INVALID");
    }
  }
  async request(
    url: string,
    conditional?: { etag: string | null; lastModified: string | null },
    attempt = 0,
  ): Promise<Response> {
    const blocked = Math.max(
      this.blockedUntil,
      this.failures.get(url)?.until ?? 0,
    );
    if (Date.now() < blocked)
      throw new SourceError("TSE_BACKOFF", 0, blocked - Date.now());
    await this.limiter.acquire();
    if (Date.now() < this.blockedUntil) throw new SourceError("TSE_BACKOFF");
    const started = Date.now();
    let received: Response | undefined;
    let status = 0,
      etag: string | null = null,
      error: string | null = null;
    this.metrics.fetchCount++;
    this.metrics.lastFetchAt = new Date().toISOString();
    try {
      const response = await this.transport(url, {
        headers: {
          ...(conditional?.etag ? { "If-None-Match": conditional.etag } : {}),
          ...(conditional?.lastModified
            ? { "If-Modified-Since": conditional.lastModified }
            : {}),
        },
        signal: AbortSignal.timeout(this.timeout),
        redirect: "error",
      });
      received = response;
      status = response.status;
      etag = response.headers.get("etag");
      if (!response.ok && status !== 304) {
        await response.body?.cancel();
        const retry = response.headers.get("retry-after");
        const retryMs = retry
          ? Number.isFinite(Number(retry))
            ? Number(retry) * 1000
            : Math.max(0, Date.parse(retry) - Date.now())
          : 0;
        throw new SourceError(
          status === 429 ? "TSE_RATE_LIMIT" : "TSE_HTTP_ERROR",
          status,
          retryMs,
        );
      }
      this.metrics.lastSuccessAt = new Date().toISOString();
      this.metrics.lastError = null;
      this.failures.delete(url);
      if (status === 304) this.metrics.count304++;
      else this.metrics.count200++;
      return response;
    } catch (e) {
      const code =
        e instanceof SourceError
          ? e.code
          : e instanceof Error &&
              (e.name === "TimeoutError" || e.name === "AbortError")
            ? "TSE_TIMEOUT"
            : String(e).includes("ENOTFOUND") ||
                (e instanceof Error &&
                  e.cause &&
                  typeof e.cause === "object" &&
                  "code" in e.cause &&
                  ["ENOTFOUND", "EAI_AGAIN"].includes(String(e.cause.code)))
              ? "TSE_DNS_ERROR"
              : "TSE_HTTP_ERROR";
      error = code;
      this.metrics.errors++;
      this.metrics.lastError = code;
      const count = (this.failures.get(url)?.count ?? 0) + 1;
      const delay = Math.max(
        e instanceof SourceError ? e.retryAfter : 0,
        status === 403 || status === 429
          ? 600000
          : status === 404
            ? 60000
            : backoff(count),
      );
      this.failures.set(url, { count, until: Date.now() + delay });
      if (status === 403 || status === 429)
        this.blockedUntil = Date.now() + delay;
      // A retry is bounded and scheduled, never recursive polling on 403/404/429.
      if (attempt < 1 && (status >= 500 || code === "TSE_TIMEOUT")) {
        await sleep(Math.min(delay, 10000));
        return this.request(url, conditional, attempt + 1);
      }
      throw e instanceof SourceError ? e : new SourceError(code, status);
    } finally {
      const durationMs = Date.now() - started;
      this.metrics.totalLatency += durationMs;
      const logId = this.repo.log({
        resource: url,
        urlHash: hash(url),
        status,
        durationMs,
        etag,
        changed: false,
        error,
      });
      if (received) this.responseLogs.set(received, logId);
    }
  }
}
