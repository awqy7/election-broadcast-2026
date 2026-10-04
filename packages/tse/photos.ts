import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Office, CandidateResult } from "../shared";
import { TseHttpClient, SourceError } from "./http";
import { TseUrlBuilder } from "./config";
type Failure = { at: string; error: string; status?: number };
export class CandidatePhotoService {
  private pending = new Map<string, Office>();
  private failures = new Map<string, Failure | null>();
  private running = Promise.resolve();
  private busy = false;
  private active: string | null = null;
  private stopped = false;
  private consecutiveErrors = 0;
  private pausedUntil = 0;
  constructor(
    private directory: string,
    private http: TseHttpClient,
    private urls: () => TseUrlBuilder,
    private uf: string,
    private onReady: () => void = () => {},
  ) {
    mkdirSync(directory, { recursive: true });
    this.pausedUntil = http.repo.get<number>("photos-paused-until") ?? 0;
  }
  local(sqcand: string) {
    return /^\d+$/.test(sqcand) &&
      existsSync(resolve(this.directory, `${sqcand}.jpeg`))
      ? `/photos/${sqcand}.jpeg`
      : null;
  }
  private failure(sqcand: string) {
    if (!this.failures.has(sqcand))
      this.failures.set(
        sqcand,
        this.http.repo.get<Failure>(`photo-missing:${sqcand}`),
      );
    return this.failures.get(sqcand) ?? null;
  }
  queue(
    sqcand: string,
    office: Office,
    options: { priority?: boolean; retry?: boolean } = {},
  ) {
    if (
      this.stopped ||
      !/^\d+$/.test(sqcand) ||
      this.local(sqcand) ||
      this.active === sqcand
    )
      return;
    const failed = this.failure(sqcand);
    // Missing photos are retried only by an explicit operator command, never on every poll.
    if (
      failed &&
      (!options.retry || Date.now() - Date.parse(failed.at) < 600000)
    )
      return;
    if (options.priority)
      this.pending = new Map([
        [sqcand, office],
        ...[...this.pending].filter(([id]) => id !== sqcand),
      ]);
    else this.pending.set(sqcand, office);
    this.start();
  }
  summary(candidates: CandidateResult[]) {
    const summary = {
      total: candidates.length,
      cached: 0,
      queued: 0,
      failed: 0,
      waiting: 0,
      pausedUntil: Math.max(this.pausedUntil, this.http.blockedUntil),
    };
    for (const c of candidates) {
      if (this.local(c.sqcand)) summary.cached++;
      else if (this.pending.has(c.sqcand) || this.active === c.sqcand)
        summary.queued++;
      else if (this.failure(c.sqcand)) summary.failed++;
      else summary.waiting++;
    }
    return summary;
  }
  private start() {
    if (
      this.busy ||
      this.stopped ||
      Date.now() < Math.max(this.pausedUntil, this.http.blockedUntil)
    )
      return;
    this.busy = true;
    this.running = this.drain().finally(() => {
      this.busy = false;
    });
  }
  private async drain() {
    while (
      this.pending.size &&
      !this.stopped &&
      Date.now() >= Math.max(this.pausedUntil, this.http.blockedUntil)
    ) {
      const [sqcand, office] = this.pending.entries().next().value!;
      this.pending.delete(sqcand);
      this.active = sqcand;
      const missingKey = `photo-missing:${sqcand}`;
      let response: Response | undefined;
      try {
        response = await this.http.request(
          this.urls().photo(office, this.uf, sqcand),
        );
        const b = Buffer.from(await response.arrayBuffer());
        this.http.metrics.bytesDownloaded += b.length;
        if (b.length > 2_000_000 || b[0] !== 0xff || b[1] !== 0xd8)
          throw new Error("Foto JPEG inválida");
        const target = resolve(this.directory, `${sqcand}.jpeg`);
        writeFileSync(target + ".tmp", b);
        renameSync(target + ".tmp", target);
        this.http.markResponse(response, true);
        this.http.repo.set(missingKey, null);
        this.failures.set(sqcand, null);
        this.consecutiveErrors = 0;
        this.onReady();
      } catch (e) {
        const failure = {
          at: new Date().toISOString(),
          error: String(e),
          status: e instanceof SourceError ? e.status : 0,
        };
        this.http.repo.set(missingKey, failure);
        this.failures.set(sqcand, failure);
        if (response) this.http.markResponse(response, false, failure.error);
        // Stop a failing batch before many absent images can trigger a source block.
        this.consecutiveErrors++;
        if (
          this.consecutiveErrors >= 3 ||
          this.http.blockedUntil > Date.now()
        ) {
          this.pausedUntil = Math.max(
            Date.now() + 600000,
            this.http.blockedUntil,
          );
          this.http.repo.set("photos-paused-until", this.pausedUntil);
          this.consecutiveErrors = 0;
        }
      } finally {
        this.active = null;
      }
    }
  }
  async close() {
    this.stopped = true;
    this.pending.clear();
    await this.running;
  }
  async idle() {
    await this.running;
  }
}
