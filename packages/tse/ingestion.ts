import { ZodError } from "zod";
import {
  EA11Schema,
  EA12Schema,
  EA14Schema,
  EA15Schema,
  EA20Schema,
} from "./schemas";
import {
  ElectionConfigService,
  initialElectionConfig,
  simulationElectionConfig,
  MunicipalityService,
  TseUrlBuilder,
  type ElectionConfig,
  type Municipality,
} from "./config";
import { ResultNormalizer } from "./normalizer";
import { TseHttpClient } from "./http";
import { MockSource, mockConfig, mockMunicipalityDocument } from "./mock";
import { SnapshotRepository } from "../core/repository";
import { CandidatePhotoService } from "./photos";
import { resultKey, type BroadcastState, type ElectionResult } from "../shared";
export class TseIngestionService {
  config: ElectionConfig;
  municipality: Municipality | null;
  results = new Map<string, ElectionResult>();
  mock = new MockSource();
  photos: CandidatePhotoService;
  lastError: string | null = null;
  sourceErrors = new Map<string, string>();
  lastResultSuccessAt: string | null = null;
  lastResultChangedAt: string | null = null;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private busy = false;
  private configuredAt = 0;
  private checked = new Map<string, number>();
  private signatures = new Map<string, string>();
  private trackingCache = new Map<
    string,
    { at: number; data: ReturnType<typeof EA15Schema.parse> }
  >();
  constructor(
    public mode: "mock" | "tse" | "tse-sim",
    public repo: SnapshotRepository,
    public http: TseHttpClient,
    public options: {
      host: string;
      uf: string;
      municipalityName: string;
      interval: number;
      photoDirectory: string;
    },
    private active: () => BroadcastState[],
    private changed: () => void,
  ) {
    this.config = repo.get<ElectionConfig>("electionConfig") ?? {
      ...(this.mode === "tse-sim"
        ? simulationElectionConfig
        : initialElectionConfig),
      host: options.host,
    };
    this.config.host = options.host;
    this.municipality = repo.get("municipality");
    if (mode === "mock") {
      this.config = mockConfig;
      this.municipality = MunicipalityService.resolveMunicipality(
        "mg",
        "Teófilo Otoni",
        mockMunicipalityDocument,
      );
    }
    for (const value of repo.memory.values()) {
      if (
        value.environment !==
        (mode === "tse"
          ? "oficial"
          : mode === "tse-sim"
            ? "simulado2026"
            : "mock")
      )
        throw new Error("Banco incompatível com DATA_MODE");
      const scope =
        value.scopeType === "mu"
          ? "municipality"
          : value.scopeType === "uf"
            ? "state"
            : "br";
      this.results.set(`${scope}:${value.officeCode}`, value);
    }
    this.lastResultChangedAt =
      [...this.results.values()]
        .map((r) => r.receivedAt)
        .sort()
        .at(-1) ?? null;
    this.photos = new CandidatePhotoService(
      options.photoDirectory,
      http,
      () => this.urls(),
      options.uf,
      () => this.changed(),
    );
  }
  urls() {
    return new TseUrlBuilder(this.config);
  }
  result(state: BroadcastState) {
    const result = this.results.get(resultKey(state));
    if (!result) return null;
    return this.mode !== "mock"
      ? {
          ...result,
          candidates: result.candidates.map((c) => ({
            ...c,
            photoUrl: this.photos.local(c.sqcand),
          })),
        }
      : result;
  }
  async configure() {
    const { data } = await this.http.json(this.urls().ea11(), EA11Schema);
    this.config = ElectionConfigService.fromEA11(data, {
      ...(this.mode === "tse-sim"
        ? simulationElectionConfig
        : initialElectionConfig),
      host: this.options.host,
    });
    this.repo.set("electionConfig", this.config);
    const municipalities = await this.http.json(this.urls().ea12(), EA12Schema);
    if (municipalities.data.f !== (this.mode === "tse" ? "o" : "s"))
      throw new Error("TSE_SCHEMA_INVALID: EA12 não oficial");
    this.municipality = MunicipalityService.resolveMunicipality(
      this.options.uf,
      this.options.municipalityName,
      municipalities.data,
    );
    this.repo.set("municipality", this.municipality);
    this.configuredAt = Date.now();
  }
  async start() {
    this.stopped = false;
    await this.cycle();
  }
  async cycle() {
    if (this.stopped) return;
    await this.poll();
    if (!this.stopped)
      this.timer = setTimeout(
        () => void this.cycle(),
        this.options.interval * (1 + Math.random() * 0.15),
      );
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
  async close() {
    this.stop();
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 50));
    await this.photos.close();
  }
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.mode !== "mock" && Date.now() - this.configuredAt > 3600000)
        await this.configure();
      for (const state of this.active()) {
        try {
          await this.ingest(state);
          this.sourceErrors.delete(resultKey(state));
        } catch (e) {
          const error =
            e instanceof ZodError || e instanceof SyntaxError
              ? "TSE_SCHEMA_INVALID"
              : String(e);
          this.sourceErrors.set(resultKey(state), error);
          this.repo.audit(
            "SOURCE_REJECTED",
            { resource: resultKey(state) },
            { error },
          );
        }
      }
      this.lastError =
        this.active()
          .map((s) => this.sourceErrors.get(resultKey(s)))
          .find(Boolean) ?? null;
      if (this.mode === "mock") this.mock.advance();
    } catch (e) {
      this.lastError = e instanceof ZodError ? "TSE_SCHEMA_INVALID" : String(e);
    } finally {
      this.busy = false;
    }
  }
  async ingest(state: BroadcastState, force = false) {
    this.preparePhotos(state);
    const key = resultKey(state);
    let raw: unknown;
    let resource: string;
    const scopeType =
      state.scope === "br" ? "br" : state.scope === "state" ? "uf" : "mu";
    const code =
      state.scope === "br"
        ? "br"
        : state.scope === "state"
          ? this.options.uf
          : this.municipality?.code;
    const scopeName =
      state.scope === "br"
        ? "Brasil"
        : state.scope === "state"
          ? (this.municipality?.stateName ?? this.options.uf.toUpperCase())
          : `${this.municipality?.name ?? this.options.municipalityName} • ${this.options.uf.toUpperCase()}`;
    if (!code) throw new Error("MUNICIPALITY_NOT_FOUND");
    if (this.mode === "mock") {
      raw = this.mock.document(state.officeCode, state.scope);
      resource = `mock://${key}`;
    } else {
      resource = this.urls().ea20(
        state.officeCode,
        state.scope,
        this.options.uf,
        this.municipality?.code,
      );
      if (!force && state.officeCode !== "0001" && this.results.has(key)) {
        try {
          const area = state.scope === "municipality" ? this.options.uf : "br";
          const url = this.urls().accompanying(area);
          let tracked = this.trackingCache.get(url);
          if (!tracked || Date.now() - tracked.at > this.options.interval) {
            const response = await this.http.json(
              url,
              area === "br" ? EA14Schema : EA15Schema,
            );
            if (
              response.data.f !== (this.mode === "tse" ? "o" : "s") ||
              Number(response.data.ele) !== Number(this.config.stateElectionId)
            )
              throw new Error("TSE_SCHEMA_INVALID: acompanhamento");
            tracked = { at: Date.now(), data: response.data };
            this.trackingCache.set(url, tracked);
          }
          const entry = tracked.data.abr.find(
            (a) => a.cdabr.toLowerCase() === code.toLowerCase(),
          );
          const signature = entry
            ? `${entry.dt}:${entry.ht}:${entry.s.st}`
            : "";
          if (
            signature &&
            this.signatures.get(key) === signature &&
            Date.now() - (this.checked.get(key) ?? 0) < 60000
          )
            return;
          this.signatures.set(key, signature);
        } catch {
          /* Companion files are hints; EA20 still receives a periodic reconciliation. */ if (
            Date.now() - (this.checked.get(key) ?? 0) <
            60000
          )
            return;
        }
      }
      const response = await this.http.json(resource, EA20Schema);
      raw = response.data;
      this.checked.set(key, Date.now());
    }
    const result = ResultNormalizer.normalize(raw, {
      office: state.officeCode,
      scopeType,
      scopeCode: code,
      scopeName,
      electionId: this.urls().election(state.officeCode),
      round: this.config.round,
      mode: this.mode,
      resource,
    });
    result.candidates = result.candidates.map((c) => ({
      ...c,
      photoUrl:
        this.mode !== "mock"
          ? this.photos.local(c.sqcand)
          : this.mock.missingPhoto
            ? "/photos/missing-simulated.jpeg"
            : null,
    }));
    const didChange = this.repo.save(result, raw);
    this.lastResultSuccessAt = new Date().toISOString();
    this.lastError = null;
    if (didChange) {
      this.results.set(key, result);
      this.lastResultChangedAt = new Date().toISOString();
      this.changed();
    }
    this.preparePhotos(state);
  }
  preparePhotos(state: BroadcastState, retry = false) {
    const result = this.results.get(resultKey(state));
    if (this.mode === "mock" || !result) return;
    const visible = new Set([
      ...result.candidates.slice(0, state.topCount).map((c) => c.id),
      ...state.selectedCandidateIds,
    ]);
    for (const c of result.candidates.filter((c) => visible.has(c.id)))
      this.photos.queue(c.sqcand, state.officeCode, { priority: true, retry });
    for (const c of result.candidates.filter((c) => !visible.has(c.id)))
      this.photos.queue(c.sqcand, state.officeCode, { retry });
  }
}
