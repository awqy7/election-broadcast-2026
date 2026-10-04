import { lookup } from "node:dns/promises";
import { resolve } from "node:path";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { EA11Schema, EA12Schema, EA14Schema, EA15Schema } from "../tse/schemas";
import { MunicipalityService } from "../tse/config";
import type { TseIngestionService } from "../tse/ingestion";
import type { TseHttpClient } from "../tse/http";
import type { SnapshotRepository } from "./repository";
import type { BroadcastStateService } from "../broadcast/state";
import type { SseHub } from "../broadcast/sse";
export class DiagnosticsService {
  private running = false;
  constructor(
    private dependencies: {
      mode: "tse" | "mock" | "tse-sim";
      repo: SnapshotRepository;
      directory: string;
      engine: TseIngestionService;
      http: TseHttpClient;
      broadcast: BroadcastStateService;
      hub: SseHub;
    },
  ) {}
  async run() {
    const { mode, repo, directory, engine, http, broadcast, hub } =
      this.dependencies;
    if (this.running) throw new Error("Diagnóstico já em execução");
    this.running = true;
    const results: {
      name: string;
      status: "PASS" | "WARN" | "FAIL";
      durationMs: number;
      detail: string;
    }[] = [];
    const check = async (
      name: string,
      fn: () => Promise<string> | string,
      warn = false,
    ) => {
      const start = Date.now();
      try {
        results.push({
          name,
          status: "PASS",
          durationMs: Date.now() - start,
          detail: await fn(),
        });
        results[results.length - 1].durationMs = Date.now() - start;
      } catch (e) {
        results.push({
          name,
          status: warn ? "WARN" : "FAIL",
          durationMs: Date.now() - start,
          detail: String(e),
        });
      }
    };
    try {
      await check("Servidor", () => `Node ${process.version}`);
      await check("SQLite leitura/escrita", () => {
        repo.db.transaction(() => {
          repo.set("diagnostic", { at: Date.now() });
          if (!repo.get("diagnostic")) throw new Error("Leitura falhou");
        })();
        return "Transação confirmada";
      });
      await check("Cache leitura/escrita", () => {
        const path = resolve(directory, "cache/diagnostic.txt");
        writeFileSync(path, "ok");
        const v = readFileSync(path, "utf8");
        unlinkSync(path);
        if (v !== "ok") throw new Error("Cache inválido");
        return "ok";
      });
      if (mode !== "mock") {
        await check("DNS TSE", async () => {
          await lookup(engine.config.host);
          return "Resolvido";
        });
        await check("HTTPS TSE / EA11", async () => {
          await http.json(engine.urls().ea11(), EA11Schema);
          return "HTTPS e schema válidos";
        });
        await check("EA12 / Teófilo Otoni", async () => {
          const r = await http.json(engine.urls().ea12(), EA12Schema);
          return JSON.stringify(
            MunicipalityService.resolveMunicipality(
              engine.options.uf,
              engine.options.municipalityName,
              r.data,
            ),
          );
        });
        for (const area of ["br", engine.options.uf])
          await check(
            area === "br" ? "EA14" : "EA15",
            async () => {
              await http.json(
                engine.urls().accompanying(area),
                area === "br" ? EA14Schema : EA15Schema,
              );
              return "Schema válido";
            },
            true,
          );
        await check(
          "EA20",
          async () => {
            await engine.ingest(broadcast.preview, true);
            return mode === "tse-sim"
              ? "Snapshot do simulado TSE validado"
              : "Snapshot oficial validado";
          },
          true,
        );
      } else
        results.push({
          name: "Fonte TSE",
          status: "WARN",
          durationMs: 0,
          detail: "SIMULAÇÃO: rede oficial não consultada",
        });
      await check(
        "SSE",
        () => {
          if (!hub.clients.size) throw new Error("Nenhum cliente conectado");
          hub.publish("connection");
          return `${hub.clients.size} clientes conectados`;
        },
        true,
      );
      await check(
        "Overlay",
        () => {
          if (![...hub.clients.values()].some((p) => !p))
            throw new Error("Abra a aba da saida: /overlay/program");
          return "Saida conectada";
        },
        true,
      );
      repo.set("lastDiagnostics", results);
      return results;
    } finally {
      this.running = false;
    }
  }
}
