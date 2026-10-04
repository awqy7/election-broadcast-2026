import { it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotRepository } from "../packages/core/repository";
import { TseHttpClient, RateLimiter } from "../packages/tse/http";
import { TseUrlBuilder } from "../packages/tse/config";
import { mockConfig } from "../packages/tse/mock";
import { CandidatePhotoService } from "../packages/tse/photos";
it("foto é cacheada, reutilizada e ausência não recebe polling", async () => {
  const dir = mkdtempSync(join(tmpdir(), "election-photos-"));
  const repo = new SnapshotRepository(join(dir, "db.sqlite"));
  let ready = 0;
  const transport = vi.fn(
    async () => new Response(new Uint8Array([255, 216, 255, 217])),
  );
  const http = new TseHttpClient(repo, new RateLimiter(1), 1000, transport);
  const service = new CandidatePhotoService(
    join(dir, "photos"),
    http,
    () => new TseUrlBuilder(mockConfig),
    "mg",
    () => ready++,
  );
  try {
    service.queue("123", "0003");
    await service.idle();
    expect(service.local("123")).toBe("/photos/123.jpeg");
    service.queue("123", "0003");
    await service.idle();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(ready).toBe(1);
    transport.mockImplementation(async () => new Response("", { status: 404 }));
    service.queue("456", "0003");
    await service.idle();
    service.queue("456", "0003");
    await service.idle();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(repo.get("photo-missing:456")).not.toBeNull();
    expect(service.local("456")).toBeNull();
    service.queue("456", "0003", { retry: true });
    await service.idle();
    expect(transport).toHaveBeenCalledTimes(2);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 600001);
    transport.mockImplementation(
      async () => new Response(new Uint8Array([255, 216, 255, 217])),
    );
    service.queue("456", "0003", { retry: true });
    await service.idle();
    expect(service.local("456")).toBe("/photos/456.jpeg");
    expect(repo.get("photo-missing:456")).toBeNull();
    expect(ready).toBe(2);
    service.queue("456", "0003", { retry: true });
    await service.idle();
    expect(transport).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
    await service.close();
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("lote de fotos pausa após três falhas e protege consultas de resultados", async () => {
  const dir = mkdtempSync(join(tmpdir(), "election-photos-breaker-"));
  const repo = new SnapshotRepository(join(dir, "db.sqlite"));
  const transport = vi.fn(async () => new Response("", { status: 404 }));
  const http = new TseHttpClient(repo, new RateLimiter(1), 1000, transport);
  const service = new CandidatePhotoService(
    join(dir, "photos"),
    http,
    () => new TseUrlBuilder(mockConfig),
    "mg",
  );
  try {
    for (const id of ["1", "2", "3", "4", "5"]) service.queue(id, "0003");
    await service.idle();
    expect(transport).toHaveBeenCalledTimes(3);
    expect(service.summary([]).pausedUntil).toBeGreaterThan(Date.now());
    expect(http.blockedUntil).toBe(0);
    service.queue("6", "0003");
    await service.idle();
    expect(transport).toHaveBeenCalledTimes(3);
  } finally {
    await service.close();
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
