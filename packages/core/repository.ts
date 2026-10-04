import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ElectionResult } from "../shared";
import { migrations } from "./migrations";
export class SnapshotRepository {
  db: Database.Database;
  memory = new Map<string, ElectionResult>();
  constructor(public path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)",
    );
    for (const { name, sql } of migrations) {
      if (
        !this.db.prepare("SELECT name FROM migrations WHERE name=?").get(name)
      )
        this.db.transaction(() => {
          this.db.exec(sql);
          this.db.prepare("INSERT INTO migrations VALUES (?)").run(name);
        })();
    }
    for (const row of this.db
      .prepare(
        "SELECT json,resource FROM snapshot WHERE id IN (SELECT MAX(id) FROM snapshot GROUP BY resource)",
      )
      .all() as { json: string; resource: string }[])
      this.memory.set(row.resource, JSON.parse(row.json));
  }
  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT json FROM kv WHERE key=?").get(key) as
      { json: string } | undefined;
    return row ? JSON.parse(row.json) : null;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json",
      )
      .run(key, JSON.stringify(value));
  }
  save(result: ElectionResult, raw: unknown): boolean {
    const previous = this.memory.get(result.sourceResource);
    if (previous?.hash === result.hash) return false;
    if (
      previous &&
      Date.parse(result.generatedAt) < Date.parse(previous.generatedAt)
    )
      throw new Error("TSE_STALE: snapshot regressivo rejeitado");
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO snapshot(election,scope,office,resource,idg,generatedAt,receivedAt,hash,json,raw) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          result.electionId,
          result.scopeCode,
          result.officeCode,
          result.sourceResource,
          result.sourceIdg,
          result.generatedAt,
          result.receivedAt,
          result.hash,
          JSON.stringify(result),
          JSON.stringify(raw),
        );
      this.db
        .prepare(
          "DELETE FROM snapshot WHERE resource=? AND id NOT IN (SELECT id FROM snapshot WHERE resource=? ORDER BY id DESC LIMIT 120)",
        )
        .run(result.sourceResource, result.sourceResource);
    })();
    this.memory.set(result.sourceResource, result);
    return true;
  }
  cache(resource: string) {
    return this.db
      .prepare("SELECT etag,lastModified,body FROM http_cache WHERE resource=?")
      .get(resource) as
      | { etag: string | null; lastModified: string | null; body: string }
      | undefined;
  }
  cachePut(
    resource: string,
    etag: string | null,
    lastModified: string | null,
    body: string,
  ) {
    this.db
      .prepare(
        "INSERT INTO http_cache VALUES (?,?,?,?) ON CONFLICT(resource) DO UPDATE SET etag=excluded.etag,lastModified=excluded.lastModified,body=excluded.body",
      )
      .run(resource, etag, lastModified, body);
  }
  log(entry: {
    resource: string;
    urlHash: string;
    status: number;
    durationMs: number;
    etag: string | null;
    changed: boolean;
    error: string | null;
  }) {
    const inserted = this.db
      .prepare(
        "INSERT INTO fetch_log(timestamp,resource,urlHash,status,durationMs,etag,changed,error) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        new Date().toISOString(),
        entry.resource,
        entry.urlHash,
        entry.status,
        entry.durationMs,
        entry.etag,
        Number(entry.changed),
        entry.error,
      );
    this.db
      .prepare(
        "DELETE FROM fetch_log WHERE id < (SELECT MAX(id)-20000 FROM fetch_log)",
      )
      .run();
    return Number(inserted.lastInsertRowid);
  }
  audit(action: string, previous: unknown, next: unknown) {
    this.db
      .prepare(
        "INSERT INTO broadcast_event(timestamp,operatorAction,previousState,nextState) VALUES (?,?,?,?)",
      )
      .run(
        new Date().toISOString(),
        action,
        JSON.stringify(previous),
        JSON.stringify(next),
      );
  }
  close() {
    this.db.close();
  }
}
