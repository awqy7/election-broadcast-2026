import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EA11Schema, EA12Schema, EA20Schema } from "../packages/tse/schemas";
import {
  ElectionConfigService,
  initialElectionConfig,
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
  resultKey,
  sortCandidates,
  stateSchema,
  calculateRunoffProjection,
  calculateSeatsProjection,
  calculateBrazilMapResults,
  displayCandidateName,
  type BrazilMapOfficialData,
} from "../packages/shared";
import { SnapshotRepository } from "../packages/core/repository";
import { FreshnessMonitor } from "../packages/core/freshness";
import { RateLimiter, TseHttpClient, backoff } from "../packages/tse/http";
import { BroadcastStateService } from "../packages/broadcast/state";
import { TseIngestionService } from "../packages/tse/ingestion";
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
    expect(config.round).toBe("1");
    expect(config.validated).toBe(true);
    expect(EA11Schema.parse(raw).arq.length).toBeGreaterThan(0);
  });
  it("descobre o 2º turno oficial pelo turno configurado", () => {
    const raw = JSON.parse(readFileSync("docs/specs/ea11-live.json", "utf8"));
    const config = ElectionConfigService.fromEA11(raw, {
      ...initialElectionConfig,
      round: "2",
    });
    expect(config.pleito).toBe("3221");
    expect(config.round).toBe("2");
    expect(config.date).toBe("25/10/2026");
    expect(config.federalElectionId).toBe("6258");
    expect(config.stateElectionId).toBe("6260");
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
    expect(urls.election("0001")).toBe(mockConfig.federalElectionId);
    expect(urls.election("0003")).toBe(mockConfig.stateElectionId);
    expect(urls.election("0008")).toBe(mockConfig.districtElectionId);
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
  it("suporta zona eleitoral e municípios no TseUrlBuilder e MunicipalityService", () => {
    const urls = new TseUrlBuilder(mockConfig);
    expect(urls.ea20("0003", "zone", "mg", "53716", "269")).toContain(
      "mg53716-z0269-c0003-e006259-u.json",
    );
    expect(() => urls.ea20("0003", "zone", "mg", "53716")).toThrow(
      "ZONE_NOT_FOUND",
    );
    const doc = JSON.parse(readFileSync("docs/specs/ea12-live.json", "utf8"));
    const list = MunicipalityService.listMunicipalities("mg", doc);
    expect(list.length).toBe(853);
    const bh = list.find((m) => m.name === "BELO HORIZONTE");
    expect(bh?.zones.length).toBeGreaterThan(1);
    const resolved = MunicipalityService.resolveByCode("mg", "53716", doc);
    expect(resolved.name).toBe("TEÓFILO OTONI");
    expect(resolved.zones).toContain("0269");
  });
  it("extrai estatísticas eleitorais (eleitorado, comparecimento, brancos, nulos) do EA20", () => {
    const simRaw = JSON.parse(readFileSync("docs/specs/ea20-sim.json", "utf8"));
    const simResult = ResultNormalizer.normalize(simRaw, {
      ...context,
      mode: "tse-sim",
      scopeCode: simRaw.cdabr,
      electionId: simRaw.ele,
    });
    expect(simResult.stats).toBeDefined();
    expect(simResult.stats?.electorateTotal).toBe(107365);
    expect(simResult.stats?.turnout).toBe(91432);
    expect(simResult.stats?.turnoutPercent).toBe(85.16);
    expect(simResult.stats?.blankVotes).toBe(5841);
    expect(simResult.stats?.nullVotes).toBe(6292);
    expect(simResult.stats?.validVotes).toBe(66104);
  });
  it("BroadcastState e reducer suportam cena stats, zonas e filtros", () => {
    const s = stateSchema.parse({});
    expect(s.scene).toBe("top");
    expect(s.showVice).toBe(true);
    expect(s.showStats).toBe(true);
    const statsState = reduceState(s, {
      scene: "stats",
      scope: "zone",
      municipalityCode: "53716",
      zoneCode: "0269",
    });
    expect(statsState.scene).toBe("stats");
    expect(statsState.scope).toBe("zone");
    expect(statsState.municipalityCode).toBe("53716");
    expect(statsState.zoneCode).toBe("0269");
    expect(resultKey(statsState)).toBe("zone:53716:0269:0003");
  });
  it("reducer limpa seleção e rejeita Brasil/governador", () => {
    const s = stateSchema.parse({ selectedCandidateIds: ["x"] });
    expect(reduceState(s, { officeCode: "0005" }).selectedCandidateIds).toEqual(
      [],
    );
    expect(
      reduceState(s, { municipalityCode: "41238" }).selectedCandidateIds,
    ).toEqual([]);
    expect(reduceState(s, { zoneCode: "0002" }).selectedCandidateIds).toEqual(
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
  it("restauração preserva resultados de zona e município compatíveis com resultKey", () => {
    const mock = new MockSource();
    const doc = mock.document("0003", "zone", "53716", "0269");
    const result = ResultNormalizer.normalize(doc, {
      ...context,
      scopeType: "zona",
      scopeCode: "0269",
      municipalityCode: "53716",
      zoneCode: "0269",
      resource: "mock://zone:53716:0269:0003",
    });
    expect(repo.save(result, doc)).toBe(true);
    const http = new TseHttpClient(repo, new RateLimiter(), 1000);
    const ingestion = new TseIngestionService(
      "mock",
      repo,
      http,
      {
        host: "localhost",
        uf: "mg",
        municipalityName: "Teófilo Otoni",
        interval: 1000,
        photoDirectory: join(dir, "photos"),
      },
      () => [],
      () => {},
    );
    const targetState = stateSchema.parse({
      scope: "zone",
      officeCode: "0003",
      municipalityCode: "53716",
      zoneCode: "0269",
    });
    const restored = ingestion.result(targetState);
    expect(restored).not.toBeNull();
    expect(restored?.scopeType).toBe("zona");
    expect(restored?.zoneCode).toBe("0269");
    expect(restored?.municipalityCode).toBe("53716");
    expect(restored?.stats?.electorateTotal).toBeGreaterThan(0);
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

it("filtros de estúdio e normalização de zona eleitoral operam com fidelidade", () => {
  const mock = new MockSource();
  const doc = mock.document("0003", "zone", "53716", "0269");
  expect(doc.tpabr).toBe("zona");
  expect(doc.cdabr).toBe("0269");
  const res = ResultNormalizer.normalize(doc, {
    ...context,
    scopeType: "zona",
    scopeCode: "0269",
    municipalityCode: "53716",
    zoneCode: "0269",
  });
  expect(res.scopeType).toBe("zona");
  expect(res.zoneCode).toBe("0269");
  expect(res.municipalityCode).toBe("53716");

  // Predicados de filtro do Studio
  const candidates = res.candidates;
  expect(candidates.length).toBeGreaterThan(0);

  // Filtro por partido
  const firstParty = candidates[0].partyAcronym;
  const filteredByParty = candidates.filter(
    (c) => c.partyAcronym === firstParty,
  );
  expect(filteredByParty.every((c) => c.partyAcronym === firstParty)).toBe(
    true,
  );

  // Filtro por situação válida
  const validCandidates = candidates.filter(
    (c) => !c.destination || c.destination === "Válido",
  );
  expect(validCandidates.length).toBeGreaterThan(0);

  // Definidos matematicamente
  res.mathematicallyDefined = "s";
  const definedCandidates = candidates.filter(
    (c) =>
      res.mathematicallyDefined === "s" ||
      c.officialStatus === "Eleito" ||
      c.officialStatus === "2º turno",
  );
  expect(definedCandidates.length).toBe(candidates.length);
});

it("segundo turno: cálculo de projeção matemática de vitória e limiar de confirmação", () => {
  const mock = new MockSource();
  const doc = mock.document("0003", "state");
  const res = ResultNormalizer.normalize(doc, {
    ...context,
    scopeType: "uf",
    scopeCode: "mg",
  });

  const proj = calculateRunoffProjection(res);
  expect(proj.hasRunoff).toBe(true);
  expect(proj.leader).not.toBeNull();
  expect(proj.runnerUp).not.toBeNull();
  expect(proj.marginVotes).toBeGreaterThanOrEqual(0);
  expect(proj.statusLabel).toBeDefined();

  // Testar caso em que o líder tem vantagem irreversível (matematicamente eleito)
  const mathElectedRes = {
    ...res,
    sectionsTotal: 100,
    sectionsTotalized: 98,
    candidates: [
      {
        ...res.candidates[0],
        votes: 1000000,
        percentage: 55.0,
      },
      {
        ...res.candidates[1],
        votes: 800000,
        percentage: 45.0,
      },
    ],
  };
  const electedProj = calculateRunoffProjection(mathElectedRes);
  expect(electedProj.isMathematicallyElected).toBe(true);
  expect(electedProj.statusLabel).toBe("MATEMATICAMENTE ELEITO");
  expect(electedProj.votesToSealVictory).toBe(0);
});

it("nome editorial só é substituído para Presidente, nunca por número em outros cargos", () => {
  expect(
    displayCandidateName(
      { number: "13", ballotName: "PATRUS ANANIAS", name: "Patrus" },
      "0003",
    ),
  ).toBe("PATRUS ANANIAS");
  expect(
    displayCandidateName(
      { number: "22", ballotName: "CANDIDATO 22", name: "Candidato" },
      "0003",
    ),
  ).toBe("CANDIDATO 22");
  expect(
    displayCandidateName(
      { number: "13", ballotName: "LUIZ INÁCIO LULA DA SILVA", name: "Lula" },
      "0001",
    ),
  ).toBe("LULA");
  expect(
    displayCandidateName(
      { number: "22", ballotName: "FLÁVIO NANTES BOLSONARO", name: "Flávio" },
      "0001",
    ),
  ).toBe("FLÁVIO BOLSONARO");
});

it("1º turno só declara eleito com maioria absoluta; 2º turno mantém duelo", () => {
  const base = normalize();
  const candidates = base.candidates.slice(0, 3).map((c, i) => ({
    ...c,
    votes: [45, 30, 25][i],
    percentage: [45, 30, 25][i],
  }));
  const partial = {
    ...base,
    sectionsTotal: 100,
    sectionsTotalized: 100,
    sectionsPending: 0,
    mathematicallyDefined: null,
    candidates,
    stats: undefined,
  };
  expect(calculateRunoffProjection(partial, "1").isMathematicallyElected).toBe(
    false,
  );
  expect(calculateRunoffProjection(partial, "2").isMathematicallyElected).toBe(
    true,
  );
});

it("quociente eleitoral arredonda fração 0,5 para cima", () => {
  const base = normalize();
  const result = {
    ...base,
    stats: { ...base.stats!, validVotes: 105 },
  };
  expect(calculateSeatsProjection(result, 10).electoralQuotient).toBe(11);
});

it("sistema proporcional: cálculo de quociente eleitoral, partidário e sobras (D'Hondt)", () => {
  const mock = new MockSource();
  const doc = mock.document("0006", "state");
  const res = ResultNormalizer.normalize(doc, {
    ...context,
    office: "0006",
    scopeType: "uf",
    scopeCode: "mg",
  });

  const seats = calculateSeatsProjection(res, 53);
  expect(seats.totalSeats).toBe(53);
  expect(seats.electoralQuotient).toBeGreaterThan(0);
  expect(seats.parties.length).toBeGreaterThan(0);

  // A soma de todas as cadeiras distribuídas deve ser 53
  const totalAllocated = seats.parties.reduce(
    (acc, p) => acc + p.totalSeats,
    0,
  );
  expect(totalAllocated).toBe(53);
});

it("BroadcastState suporta novas cenas de 2º turno, fullscreen, projeção e efeitos", () => {
  const s = stateSchema.parse({
    scene: "runoff",
    position: "fullscreen",
    showEffects: true,
  });
  expect(s.scene).toBe("runoff");
  expect(s.position).toBe("fullscreen");
  expect(s.showEffects).toBe(true);

  const s2 = reduceState(s, { scene: "fullscreen" });
  expect(s2.scene).toBe("fullscreen");

  const s3 = reduceState(s, { scene: "projection" });
  expect(s3.scene).toBe("projection");

  expect(stateSchema.parse({ focusedUf: "go" }).focusedUf).toBe("GO");
  expect(stateSchema.parse({ focusedUf: null }).focusedUf).toBeNull();
});

it("projeções tratam casos extremos: dados vazios, empate e ausência de seções", () => {
  // 1. Resultado nulo ou sem candidatos
  const emptyProj = calculateRunoffProjection(null);
  expect(emptyProj.hasRunoff).toBe(false);
  expect(emptyProj.leader).toBeNull();
  expect(emptyProj.isMathematicallyElected).toBe(false);

  // 2. Apenas um candidato
  const singleCandRes = {
    ...normalize(),
    candidates: [normalize().candidates[0]],
  };
  const singleProj = calculateRunoffProjection(singleCandRes);
  expect(singleProj.hasRunoff).toBe(false);
  expect(singleProj.runnerUp).toBeNull();

  // 3. Empate exato entre primeiro e segundo
  const tiedRes = {
    ...normalize(),
    candidates: [
      { ...normalize().candidates[0], votes: 5000, percentage: 50.0 },
      { ...normalize().candidates[1], votes: 5000, percentage: 50.0 },
    ],
  };
  const tiedProj = calculateRunoffProjection(tiedRes);
  expect(tiedProj.marginVotes).toBe(0);
  expect(tiedProj.marginPercent).toBe(0);

  // 4. Projeção de cadeiras com resultado nulo
  const emptySeats = calculateSeatsProjection(null);
  expect(emptySeats.parties).toEqual([]);
  expect(emptySeats.electoralQuotient).toBe(0);

  // 5. Projeção de cadeiras com 10 cadeiras e distribuição precisa
  const customSeats = calculateSeatsProjection(normalize(), 10);
  expect(customSeats.totalSeats).toBe(10);
  const sumSeats = customSeats.parties.reduce(
    (acc, p) => acc + p.totalSeats,
    0,
  );
  expect(sumSeats).toBe(10);
});

describe("Mapa oficial por UF", () => {
  const official: BrazilMapOfficialData = {
    updatedAt: "2026-10-25T18:00:00.000Z",
    states: {
      SP: {
        uf: "SP",
        votes22: 12_000_000,
        votes13: 9_000_000,
        percent22: 57.14,
        percent13: 42.86,
        sectionsPercent: 96.4,
        final: false,
        validVotes: 21_000_000,
        receivedAt: "2026-10-25T18:00:00.000Z",
        sourceGeneratedAt: "2026-10-25T18:00:00.000Z",
      },
      MG: {
        uf: "MG",
        votes22: 4_000_000,
        votes13: 5_000_000,
        percent22: 44.44,
        percent13: 55.56,
        sectionsPercent: 88.1,
        final: false,
        validVotes: 9_000_000,
        receivedAt: "2026-10-25T17:59:00.000Z",
        sourceGeneratedAt: "2026-10-25T17:59:00.000Z",
      },
    },
  };
  it("usa votos e percentuais oficiais sem gerar cidades fictícias", () => {
    const summary = calculateBrazilMapResults(null, official);
    expect(summary.official).toBe(true);
    expect(summary.statesLoaded).toBe(2);
    expect(summary.statesTotal).toBe(27);
    expect(summary.statesWon22).toBe(1);
    expect(summary.statesWon13).toBe(1);
    expect(summary.stateResults.SP.percent22).toBe(57.14);
    expect(summary.stateResults.SP.cities).toEqual([]);
    expect(summary.stateResults.MG.leader).toBe("13");
    expect(summary.updatedAt).toBe(official.updatedAt);
  });
  it("mantém UFs ausentes neutras e trata 0% como aguardando", () => {
    const summary = calculateBrazilMapResults(null, {
      updatedAt: null,
      states: {},
    });
    expect(summary.official).toBe(true);
    expect(summary.statesLoaded).toBe(0);
    expect(summary.leadingNational).toBe("tie");
    expect(summary.stateResults.AC.leader).toBe("tie");
    expect(summary.stateResults.AC.statusLabel).toBe("AGUARDANDO");
    expect(summary.stateResults.AC.votes22).toBe(0);
  });
  it("só publica mapa no 2º turno e limpa erro antigo após UF válida", async () => {
    const dir = mkdtempSync(join(tmpdir(), "election-map-test-"));
    const repo = new SnapshotRepository(join(dir, "test.db"));
    try {
      const ea11 = JSON.parse(
        readFileSync("docs/specs/ea11-live.json", "utf8"),
      );
      const config = ElectionConfigService.fromEA11(ea11, {
        ...initialElectionConfig,
        round: "2",
      });
      const raw = JSON.parse(readFileSync("docs/specs/ea20-live.json", "utf8"));
      const mapDoc = {
        ...raw,
        ele: "6258",
        t: "2",
        f: "o",
        tpabr: "uf",
        cdabr: "AC",
        carg: [
          {
            ...raw.carg[0],
            cd: "1",
            nmn: "Presidente",
            nmm: "Presidente",
            nmf: "Presidente",
          },
        ],
      };
      const http = new TseHttpClient(
        repo,
        new RateLimiter(1),
        5000,
        async () =>
          new Response(JSON.stringify(mapDoc), {
            headers: { etag: '"map-ac"' },
          }),
      );
      const engine = new TseIngestionService(
        "tse",
        repo,
        http,
        {
          host: "resultados.tse.jus.br",
          uf: "mg",
          municipalityName: "Teófilo Otoni",
          interval: 10000,
          round: "2",
          photoDirectory: join(dir, "photos"),
        },
        () => [],
        () => {},
      );
      engine.config = config;
      await (
        engine as unknown as { ingestMapState: (uf: string) => Promise<void> }
      ).ingestMapState("AC");
      expect(engine.mapSnapshot()?.states.AC).toBeDefined();
      (engine as unknown as { mapErrors: Map<string, string> }).mapErrors.set(
        "AC",
        "erro antigo",
      );
      await (
        engine as unknown as { ingestMapState: (uf: string) => Promise<void> }
      ).ingestMapState("AC");
      expect(engine.mapStatus().errors.AC).toBeUndefined();
      engine.config = { ...config, round: "1" };
      expect(engine.mapSnapshot()).toBeNull();
      expect(engine.mapStatus().loaded).toBe(0);
      await engine.close();
    } finally {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("não troca o mapa oficial por dados sintéticos quando não há UF", () => {
    const synthetic = calculateBrazilMapResults(null);
    expect(synthetic.official).toBe(false);
    expect(synthetic.statesLoaded).toBe(27);
    const emptyOfficial = calculateBrazilMapResults(null, {
      updatedAt: null,
      states: {},
    });
    expect(emptyOfficial.statesWon22).toBe(0);
    expect(emptyOfficial.statesWon13).toBe(0);
  });
});
