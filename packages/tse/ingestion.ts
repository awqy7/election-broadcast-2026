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
import {
  BRAZIL_STATES_GEO,
  type BrazilMapOfficialData,
} from "../shared/brazil-map-data";
export class TseIngestionService {
  config: ElectionConfig;
  municipality: Municipality | null;
  municipalitiesList: { code: string; name: string; zones: string[] }[] = [];
  results = new Map<string, ElectionResult>();
  mapResults = new Map<string, ElectionResult>();
  mapErrors = new Map<string, string>();
  mapUpdatedAt: string | null = null;
  stateElectionAvailable = true;
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
  private mapTimer: NodeJS.Timeout | undefined;
  private mapIndex = 0;
  private mapBusy = false;
  private readonly mapIntervalMs: number;
  private readonly requestedRound: "1" | "2";
  constructor(
    public mode: "mock" | "tse" | "tse-sim",
    public repo: SnapshotRepository,
    public http: TseHttpClient,
    public options: {
      host: string;
      uf: string;
      municipalityName: string;
      interval: number;
      mapInterval?: number;
      round?: "1" | "2";
      photoDirectory: string;
    },
    private active: () => BroadcastState[],
    private changed: () => void,
  ) {
    this.mapIntervalMs = options.mapInterval ?? 2000;
    this.requestedRound = options.round ?? "1";
    this.config = repo.get<ElectionConfig>("electionConfig") ?? {
      ...(this.mode === "tse-sim"
        ? simulationElectionConfig
        : initialElectionConfig),
      host: options.host,
    };
    this.config.host = options.host;
    if (mode === "tse" && this.config.round !== this.requestedRound) {
      this.config = {
        ...this.config,
        round: this.requestedRound,
        validated: false,
      };
    }
    this.municipality = repo.get("municipality");
    this.municipalitiesList = repo.get("municipalitiesList") ?? [];
    if (mode === "mock") {
      this.config = mockConfig;
      this.municipality = MunicipalityService.resolveMunicipality(
        "mg",
        "Teófilo Otoni",
        mockMunicipalityDocument,
      );
      this.municipalitiesList = MunicipalityService.listMunicipalities(
        "mg",
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
      if (value.scopeType === "uf") {
        if (value.officeCode === "0001") {
          const mapKey = `${value.electionId}:${value.scopeCode.toLowerCase()}`;
          const previous = this.mapResults.get(mapKey);
          if (
            !previous ||
            Date.parse(value.receivedAt) >= Date.parse(previous.receivedAt)
          )
            this.mapResults.set(mapKey, value);
        }
        if (value.scopeCode.toLowerCase() === this.options.uf.toLowerCase()) {
          const key = `state:${value.officeCode}`;
          const previous = this.results.get(key);
          if (
            !previous ||
            Date.parse(value.receivedAt) >= Date.parse(previous.receivedAt)
          )
            this.results.set(key, value);
        }
        continue;
      }
      const scope =
        value.scopeType === "mu"
          ? "municipality"
          : value.scopeType === "zona"
            ? "zone"
            : "br";
      this.results.set(`${scope}:${value.officeCode}`, value);
      if (value.scopeType === "mu") {
        this.results.set(
          `municipality:${value.scopeCode}:${value.officeCode}`,
          value,
        );
      } else if (value.scopeType === "zona") {
        const mu = value.municipalityCode ?? "default";
        const zone = value.zoneCode ?? value.scopeCode ?? "default";
        this.results.set(`zone:${mu}:${zone}:${value.officeCode}`, value);
        this.results.set(`zone:default:${zone}:${value.officeCode}`, value);
      }
    }
    this.lastResultChangedAt =
      [...this.results.values()]
        .map((r) => r.receivedAt)
        .sort()
        .slice(-1)[0] ?? null;
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
    const previousFederalElectionId = this.config.federalElectionId;
    this.config = ElectionConfigService.fromEA11(data, {
      ...(this.mode === "tse-sim"
        ? simulationElectionConfig
        : initialElectionConfig),
      host: this.options.host,
      round: this.mode === "tse-sim" ? "1" : this.requestedRound,
    });
    if (previousFederalElectionId !== this.config.federalElectionId) {
      this.results.clear();
      this.lastResultSuccessAt = null;
      this.lastResultChangedAt = null;
      this.mapErrors.clear();
      this.mapIndex = 0;
    }
    this.repo.set("electionConfig", this.config);
    const municipalities = await this.http.json(this.urls().ea12(), EA12Schema);
    if (municipalities.data.f !== (this.mode === "tse" ? "o" : "s"))
      throw new Error("TSE_SCHEMA_INVALID: EA12 não oficial");
    const ufHasStateElection = municipalities.data.abr.some(
      (a) => a.cd.toLowerCase() === this.options.uf.toLowerCase(),
    );
    if (this.config.round === "2" && !ufHasStateElection) {
      this.stateElectionAvailable = false;
      this.municipalitiesList =
        this.repo.get("municipalitiesList") ?? this.municipalitiesList;
    } else {
      this.stateElectionAvailable = true;
      this.municipality = MunicipalityService.resolveMunicipality(
        this.options.uf,
        this.options.municipalityName,
        municipalities.data,
      );
      this.repo.set("municipality", this.municipality);
      this.municipalitiesList = MunicipalityService.listMunicipalities(
        this.options.uf,
        municipalities.data,
      );
      this.repo.set("municipalitiesList", this.municipalitiesList);
    }
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
    clearTimeout(this.mapTimer);
    this.mapTimer = undefined;
  }
  async close() {
    this.stop();
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 50));
    await this.photos.close();
  }

  mapSnapshot(): BrazilMapOfficialData | null {
    if (this.mode !== "tse") return null;
    if (!this.config.validated) return { states: {}, updatedAt: null };
    const states: BrazilMapOfficialData["states"] = {};
    let updatedAt: string | null = null;
    for (const result of this.mapResults.values()) {
      if (
        result.officeCode !== "0001" ||
        result.electionId !== this.config.federalElectionId
      )
        continue;
      const sigla = result.scopeCode.toUpperCase();
      const c22 = result.candidates.find((c) => c.number === "22");
      const c13 = result.candidates.find((c) => c.number === "13");
      const visible = result.disclosureAllowed;
      const votes22 = visible ? (c22?.votes ?? 0) : 0;
      const votes13 = visible ? (c13?.votes ?? 0) : 0;
      const percent22 = visible ? (c22?.percentage ?? 0) : 0;
      const percent13 = visible ? (c13?.percentage ?? 0) : 0;
      states[sigla] = {
        uf: sigla,
        votes22,
        votes13,
        percent22,
        percent13,
        sectionsPercent: result.percentageSectionsTotalized,
        final: result.final,
        validVotes: result.stats?.validVotes ?? votes22 + votes13,
        receivedAt: result.receivedAt,
        sourceGeneratedAt: result.sourceGeneratedAt,
      };
      if (!updatedAt || result.receivedAt > updatedAt)
        updatedAt = result.receivedAt;
    }
    return { states, updatedAt };
  }

  mapStatus() {
    const map = this.mapSnapshot();
    return {
      official: this.mode === "tse",
      loaded: map ? Object.keys(map.states).length : 0,
      total: Object.keys(BRAZIL_STATES_GEO).length,
      updatedAt: map?.updatedAt ?? null,
      round: this.config.round,
      stateElectionAvailable: this.stateElectionAvailable,
      electionId: this.config.federalElectionId,
      interval: this.mapIntervalMs,
      errors: Object.fromEntries(this.mapErrors),
    };
  }

  private startMapPolling() {
    if (this.mode !== "tse" || this.mapTimer || this.stopped) return;
    const ufs = Object.keys(BRAZIL_STATES_GEO);
    const tick = async () => {
      if (this.stopped) return;
      const sigla = ufs[this.mapIndex % ufs.length];
      this.mapIndex++;
      if (!this.mapBusy) {
        this.mapBusy = true;
        try {
          await this.ingestMapState(sigla);
        } catch (e) {
          this.mapErrors.set(sigla, String(e).slice(0, 300));
        } finally {
          this.mapBusy = false;
        }
      }
      if (!this.stopped)
        this.mapTimer = setTimeout(
          () => void tick(),
          this.mapIntervalMs * (1 + Math.random() * 0.1),
        );
    };
    this.mapTimer = setTimeout(() => void tick(), 0);
  }

  private async ingestMapState(sigla: string) {
    const uf = sigla.toLowerCase();
    const resource = this.urls().ea20("0001", "state", uf);
    const response = await this.http.json(resource, EA20Schema);
    const result = ResultNormalizer.normalize(response.data, {
      office: "0001",
      scopeType: "uf",
      scopeCode: uf,
      scopeName: BRAZIL_STATES_GEO[sigla]?.name ?? sigla,
      electionId: this.urls().election("0001"),
      round: this.config.round,
      mode: this.mode,
      resource,
    });
    const key = `${result.electionId}:${uf}`;
    const previous = this.mapResults.get(key);
    this.mapResults.set(key, result);
    const changed = this.repo.save(result, response.data);
    if (changed || !previous) {
      this.mapErrors.delete(sigla);
      this.mapUpdatedAt = result.receivedAt;
      this.changed();
    }
  }
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.mode !== "mock" && Date.now() - this.configuredAt > 3600000)
        await this.configure();
      if (this.mode === "tse" && this.config.validated) this.startMapPolling();
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
      state.scope === "br"
        ? "br"
        : state.scope === "state"
          ? "uf"
          : state.scope === "zone"
            ? "zona"
            : "mu";
    const targetMuCode = state.municipalityCode || this.municipality?.code;
    const targetMu = targetMuCode
      ? (this.municipalitiesList.find((m) => m.code === targetMuCode) ??
        (targetMuCode === this.municipality?.code ? this.municipality : null))
      : this.municipality;
    const targetZone =
      state.scope === "zone"
        ? state.zoneCode || targetMu?.zones?.[0] || "0001"
        : undefined;
    const code =
      state.scope === "br"
        ? "br"
        : state.scope === "state"
          ? this.options.uf
          : state.scope === "zone"
            ? (targetZone ?? "0001")
            : (targetMu?.code ?? targetMuCode);
    const muName = targetMu?.name ?? this.options.municipalityName;
    const scopeName =
      state.scope === "br"
        ? "Brasil"
        : state.scope === "state"
          ? (this.municipality?.stateName ?? this.options.uf.toUpperCase())
          : state.scope === "zone"
            ? `${muName} • ZONA ${code} • ${this.options.uf.toUpperCase()}`
            : `${muName} • ${this.options.uf.toUpperCase()}`;
    if (!code) throw new Error("MUNICIPALITY_NOT_FOUND");
    if (this.mode === "mock") {
      raw = this.mock.document(
        state.officeCode,
        state.scope,
        targetMuCode ?? undefined,
        targetZone,
      );
      resource = `mock://${key}`;
    } else {
      resource = this.urls().ea20(
        state.officeCode,
        state.scope,
        this.options.uf,
        targetMuCode ?? undefined,
        targetZone,
      );
      if (!force && state.officeCode !== "0001" && this.results.has(key)) {
        try {
          const area =
            state.scope === "municipality" || state.scope === "zone"
              ? this.options.uf
              : "br";
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
          const checkCode =
            state.scope === "zone" ? (targetMuCode ?? code) : code;
          const entry = tracked.data.abr.find(
            (a) => a.cdabr.toLowerCase() === checkCode.toLowerCase(),
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
      municipalityCode: targetMuCode ?? null,
      zoneCode: targetZone ?? null,
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
