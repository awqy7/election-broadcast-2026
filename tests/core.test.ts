import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EA11Schema, EA12Schema, EA20Schema } from "../packages/tse/schemas";
import {
  ElectionConfigService,
  simulationElectionConfig,
  MunicipalityService,
  TseUrlBuilder,
} from "../packages/tse/config";
import {
  MockSource,
  mockConfig,
  mockMunicipalityDocument,
} from "../packages/tse/mock";
import { ResultNormalizer } from "../packages/tse/normalizer";
import {
  formatVotes,
  formatPercent,
  normalizeName,
  reduceState,
  sortCandidates,
  stateSchema,
} from "../packages/shared";
import { SnapshotRepository } from "../packages/core/repository";
import { FreshnessMonitor } from "../packages/core/freshness";
import { RateLimiter, TseHttpClient, backoff } from "../packages/tse/http";
import { BroadcastStateService } from "../packages/broadcast/state";
const context = {
  office: "0003" as const,
  scopeType: "mu" as const,
  scopeCode: "99999",
  scopeName: "Teófilo Otoni",
  electionId: mockConfig.stateElectionId,
  round: "1",
  mode: "mock" as const,
  resource: "mock://municipality:0003",
};
const fixture = () => {
  const source = new MockSource();
  source.progress = 25;
  return source.document("0003", "municipality");
};
const normalize = (value: unknown = fixture()) =>
  ResultNormalizer.normalize(value, context);
describe("Contratos oficiais e integridade", () => {
  it("valida EA11 e descobre eleição por data e cargos", () => {
    const raw = JSON.parse(readFileSync("docs/specs/ea11-live.json", "utf8"));
    const config = ElectionConfigService.fromEA11(raw);
    expect(config.pleito).toBe("3220");
    expect(config.validated).toBe(true);
    expect(EA11Schema.parse(raw).arq.length).toBeGreaterThan(0);
  });
  it("resolve município no EA12 real sem código embutido no motor", () => {
    const raw = JSON.parse(readFileSync("docs/specs/ea12-live.json", "utf8"));
    const parsed = EA12Schema.parse(raw);
    const m = MunicipalityService.resolveMunicipality(
      "MG",
      "  teofilo   otoni ",
      parsed,
    );
    expect(m.name).toBe("TEÓFILO OTONI");
    expect(m.code).toMatch(/^\d{5}$/);
    expect(() =>
      MunicipalityService.resolveMunicipality("mg", "Não existe", raw),
    ).toThrow("MUNICIPALITY_NOT_FOUND");
  });
  it("interpreta EA20 real pré-apuração com campos condicionais ausentes", () => {
    const raw = JSON.parse(readFileSync("docs/specs/ea20-live.json", "utf8"));
    const d = EA20Schema.parse(raw);
    const result = ResultNormalizer.normalize(raw, {
      ...context,
      mode: "tse",
      scopeCode: d.cdabr,
      electionId: d.ele,
    });
    expect(result.progressStatus).toBe("n");
    expect(result.mathematicallyDefined).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.officialStatus === null)).toBe(
      true,
    );
  });
  it("URLs seguem diretórios EA11, padding e escopo", () => {
    const urls = new TseUrlBuilder(mockConfig);
    expect(urls.ea12()).toContain("/6259/config/mun-e006259-cm.json");
    const m = MunicipalityService.resolveMunicipality(
      "mg",
      "Teófilo Otoni",
      mockMunicipalityDocument,
    );
    expect(urls.ea20("0003", "municipality", "mg", m.code)).toContain(
      `mg${m.code}-c0003-e006259-u.json`,
    );
    expect(urls.ea20("0001", "br", "mg")).toContain(
      "/6257/dados/br/br-c0001-e006257-u.json",
    );
    expect(() => urls.ea20("0003", "br", "mg")).toThrow();
    expect(() => urls.ea20("0003", "municipality", "mg")).toThrow();
    expect(urls.photo("0001", "mg", "123")).toContain("/fotos/br/123.jpeg");
  });
  it("herda partido, preserva percentual e não infere eleição", () => {
    const raw = EA20Schema.parse(fixture());
    const c = raw.carg[0].agr[0].par[0].cand![0];
    c.pvap = 71.32;
    c.e = "s";
    c.st = "";
    const result = normalize(raw);
    expect(result.candidates[0].partyAcronym).toBe("SIM1");
    expect(result.candidates[0].percentage).toBe(71.32);
    expect(result.candidates[0].officialStatus).toBeNull();
  });
  it("mantém status oficial, anulação e substitutos", () => {
    const source = new MockSource();
    source.progress = 100;
    source.command("runoff");
    source.command("substitute");
    const r = normalize(source.document("0003", "municipality"));
    expect(r.candidates[0].officialStatus).toBe("2º turno");
    expect(r.candidates[0].substitutes).toHaveLength(1);
  });
  it("rejeita número ausente, parcial, mistura de origem e duplicação", () => {
    const raw = EA20Schema.parse(fixture());
    const c = raw.carg[0].agr[0].par[0].cand![0];
    expect(() => normalize({ ...raw, f: "o" })).toThrow();
    expect(() => normalize({ ...raw, carg: [] })).toThrow();
    expect(() => normalize({ ...raw, s: { ...raw.s, st: 9999 } })).toThrow();
    expect(() =>
      normalize({
        ...raw,
        carg: [
          {
            cd: "3",
            agr: [
              {
                par: [
                  {
                    n: "1",
                    sg: "X",
                    nm: "X",
                    cand: [{ ...c, vap: undefined }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("aceita campos novos sem perder validação", () => {
    expect(
      normalize({ ...EA20Schema.parse(fixture()), novoCampo: "ok" }).candidates,
    ).toHaveLength(6);
  });
  it("ordena apenas votos e desempata por número", () => {
    const c = normalize().candidates;
    expect(
      sortCandidates([
        { ...c[0], votes: 50, number: "92" },
        { ...c[1], votes: 50, number: "91" },
      ])[0].number,
    ).toBe("91");
  });
  it("formatação e busca brasileiras", () => {
    expect(normalizeName("  JOÃO   Ávila ")).toBe("joao avila");
    expect(formatVotes(12320)).toBe("12.320");
    expect(formatPercent(42.5)).toBe("42,5%");
  });
  it("reducer limpa seleção e rejeita Brasil/governador", () => {
    const s = stateSchema.parse({ selectedCandidateIds: ["x"] });
    expect(reduceState(s, { officeCode: "0005" }).selectedCandidateIds).toEqual(
      [],
    );
    expect(() => reduceState(s, { scope: "br" })).toThrow();
    expect(() => reduceState(s, { topCount: 99 })).toThrow();
  });
  it("freshness distingue fonte viva sem alteração e ausência de conexão", () => {
    const f = new FreshnessMonitor();
    const now = Date.now(),
      iso = (delta: number) => new Date(now - delta).toISOString();
    expect(f.state(iso(0), iso(0), now)).toBe("FRESH");
    expect(f.state(iso(0), iso(40000), now)).toBe("DELAYED");
    expect(f.state(iso(100000), iso(100000), now)).toBe("STALE");
    expect(f.state(null, null, now)).toBe("OFFLINE");
  });
});
describe("Persistência, HOLD e HTTP", () => {
  let dir: string, repo: SnapshotRepository;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "election-test-"));
    repo = new SnapshotRepository(join(dir, "test.db"));
  });
  afterEach(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });
  it("snapshot atômico, deduplicação e rejeição de regressão", () => {
    const r = normalize();
    expect(repo.save(r, fixture())).toBe(true);
    expect(repo.save(r, fixture())).toBe(false);
    expect(() =>
      repo.save({ ...r, hash: "old", generatedAt: "2020-01-01T00:00:00Z" }, {}),
    ).toThrow("regressivo");
    expect(repo.memory.get(r.sourceResource)?.hash).toBe(r.hash);
  });
  it("restart restaura programa, HOLD e último snapshot", () => {
    let r = normalize();
    const service = new BroadcastStateService(
      repo,
      "mock",
      () => r,
      () => {},
    );
    service.take();
    service.hold();
    const frozen = service.output().result!.candidates[0].votes;
    r = {
      ...r,
      candidates: r.candidates.map((c) => ({ ...c, votes: c.votes + 300 })),
    };
    expect(service.output().result!.candidates[0].votes).toBe(frozen);
    expect(() => service.take()).toThrow("HOLD");
    const restored = new BroadcastStateService(
      repo,
      "mock",
      () => r,
      () => {},
    );
    expect(restored.program.hold).toBe(true);
    expect(restored.output().result!.candidates[0].votes).toBe(frozen);
    service.clear();
    expect(service.program.visible).toBe(false);
  });
  it("preview não altera programa e TAKE é auditado", () => {
    const service = new BroadcastStateService(
      repo,
      "mock",
      () => normalize(),
      () => {},
    );
    service.update({ scene: "progress" });
    expect(service.program.scene).toBe("top");
    service.take();
    expect(service.program.scene).toBe("progress");
    expect(
      (
        repo.db.prepare("SELECT count(*) as n FROM broadcast_event").get() as {
          n: number;
        }
      ).n,
    ).toBe(2);
  });
  it("conditional GET conserva corpo validado e rejeita JSON inválido", async () => {
    const schema = EA20Schema;
    let step = 0;
    const headersSeen: HeadersInit[] = [];
    const transport: typeof fetch = async (_url, init) => {
      headersSeen.push(init?.headers ?? {});
      step++;
      return step === 1
        ? new Response(JSON.stringify(fixture()), {
            headers: {
              etag: '"v1"',
              "last-modified": "Sun, 04 Oct 2026 20:00:00 GMT",
            },
          })
        : step === 2
          ? new Response(null, { status: 304 })
          : new Response("{invalid");
    };
    const client = new TseHttpClient(repo, new RateLimiter(1), 5000, transport);
    await client.json("https://example.test", schema);
    await client.json("https://example.test", schema);
    expect(headersSeen[1]).toMatchObject({ "If-None-Match": '"v1"' });
    await expect(client.json("https://example.test", schema)).rejects.toThrow(
      "TSE_SCHEMA_INVALID",
    );
    expect(JSON.parse(repo.cache("https://example.test")!.body).ele).toBe(
      mockConfig.stateElectionId,
    );
    expect(client.metrics.count304).toBe(1);
  });
  it("403/429 interrompem consultas globalmente", async () => {
    const transport = vi.fn(
      async () =>
        new Response("", { status: 429, headers: { "Retry-After": "600" } }),
    );
    const client = new TseHttpClient(repo, new RateLimiter(1), 5000, transport);
    await expect(client.request("https://a.test")).rejects.toThrow(
      "TSE_RATE_LIMIT",
    );
    await expect(client.request("https://b.test")).rejects.toThrow(
      "TSE_BACKOFF",
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("limita concorrência global e backoff cresce", async () => {
    const limiter = new RateLimiter(15);
    const times: number[] = [];
    await Promise.all(
      [1, 2, 3].map(async () => {
        await limiter.acquire();
        times.push(Date.now());
      }),
    );
    expect(times[2] - times[0]).toBeGreaterThanOrEqual(25);
    expect(backoff(3, 1000, () => 0)).toBe(8000);
  });
});

describe("Simulado TSE isolado", () => {
  it("descobre EA11 de testes, preserva base /simulado e rejeita ambiente trocado", () => {
    const raw = JSON.parse(readFileSync("docs/specs/ea11-sim.json", "utf8"));
    const config = ElectionConfigService.fromEA11(
      raw,
      simulationElectionConfig,
    );
    const urls = new TseUrlBuilder(config);
    expect(config.pleito).toBe("17801");
    expect(config.stateElectionId).toBe("21272");
    expect(urls.ea11()).toBe(
      "https://resultados-sim.tse.jus.br/simulado/simulado2026/comum/config/ele-c.json",
    );
    expect(urls.ea20("0001", "br", "mg")).toBe(
      "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21270/dados/br/br-c0001-e021270-u.json",
    );
    expect(() => ElectionConfigService.fromEA11(raw)).toThrow();
    expect(() =>
      ElectionConfigService.fromEA11(
        { ...raw, f: "o" },
        simulationElectionConfig,
      ),
    ).toThrow();
  });
  it("rotula resultados simulados e nunca aceita como oficiais", () => {
    const raw = fixture();
    const result = ResultNormalizer.normalize(raw, {
      ...context,
      mode: "tse-sim",
    });
    expect(result.environment).toBe("simulado2026");
    expect(result.source).toBe("TSE");
    expect(() =>
      ResultNormalizer.normalize(raw, { ...context, mode: "tse" }),
    ).toThrow();
  });
  it("troca comparação por individual mantendo apenas o primeiro selecionado", () => {
    const state = stateSchema.parse({
      scene: "compare",
      selectedCandidateIds: ["a", "b"],
    });
    expect(
      reduceState(state, { scene: "candidate" }).selectedCandidateIds,
    ).toEqual(["a"]);
  });
});

it("normaliza EA20 baixado do simulado TSE com votos e status publicados", () => {
  const raw = JSON.parse(readFileSync("docs/specs/ea20-sim.json", "utf8"));
  const result = ResultNormalizer.normalize(raw, {
    ...context,
    mode: "tse-sim",
    scopeCode: raw.cdabr,
    electionId: raw.ele,
  });
  expect(result.percentageSectionsTotalized).toBe(100);
  expect(result.candidates.some((c) => c.votes > 0)).toBe(true);
  expect(result.candidates.some((c) => c.officialStatus === "2º turno")).toBe(
    true,
  );
  expect(result.candidates[0].votes).toBeGreaterThanOrEqual(
    result.candidates[1].votes,
  );
  expect(result.environment).toBe("simulado2026");
});
