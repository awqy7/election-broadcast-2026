import {
  reduceState,
  stateSchema,
  settingsSchema,
  type BroadcastState,
  type ElectionResult,
  type Output,
  type Settings,
  resultKey,
} from "../shared";
import { SnapshotRepository } from "../core/repository";
export class BroadcastStateService {
  program: BroadcastState;
  preview: BroadcastState;
  held: ElectionResult | null;
  settings: Settings;
  programSettings: Settings;
  favorites: string[];
  sequence = 0;
  constructor(
    private repo: SnapshotRepository,
    private mode: "tse" | "mock" | "tse-sim",
    private result: (s: BroadcastState) => ElectionResult | null,
    private emit: (event: string) => void,
  ) {
    this.program = stateSchema.parse(repo.get("program") ?? {});
    this.preview = stateSchema.parse(repo.get("preview") ?? this.program);
    this.held = repo.get("held");
    this.settings = settingsSchema.parse(repo.get("settings") ?? {});
    this.programSettings = settingsSchema.parse(
      repo.get("programSettings") ?? this.settings,
    );
    this.favorites = repo.get("favorites") ?? [];
  }
  output(preview = false): Output {
    const state = preview
      ? { ...this.preview, visible: true, hold: false }
      : this.program;
    return {
      state,
      result: !preview && state.hold ? this.held : this.result(state),
      settings: preview ? this.settings : this.programSettings,
      dataMode: this.mode,
      sequence: this.sequence,
    };
  }
  update(patch: unknown) {
    const next = reduceState(this.preview, patch);
    if (next.officeCode === "0008" && next.scope !== "br")
      throw new Error("Deputado Distrital disponível somente no DF");
    this.save("preview", next, "PREVIEW");
    return next;
  }
  take() {
    if (this.program.hold) throw new Error("Desative HOLD antes de TAKE");
    const r = this.result(this.preview);
    const count = this.preview.selectedCandidateIds.length;
    if (
      (this.preview.scene === "candidate" && count !== 1) ||
      (this.preview.scene === "compare" && (count < 2 || count > 4))
    )
      throw new Error("Selecione os candidatos para esta cena");
    if (
      (this.preview.scene === "candidate" ||
        this.preview.scene === "compare") &&
      count &&
      this.preview.selectedCandidateIds.some(
        (id) => !r?.candidates.some((c) => c.id === id),
      )
    )
      throw new Error("Seleção não está no resultado atual");
    const next = {
      ...this.preview,
      visible: true,
      hold: false,
      revision: this.program.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.save("program", next, "TAKE");
  }
  clear() {
    this.save(
      "program",
      {
        ...this.program,
        visible: false,
        revision: this.program.revision + 1,
        updatedAt: new Date().toISOString(),
      },
      "CLEAR",
    );
  }
  hold() {
    const previous = this.program;
    const hold = !previous.hold;
    const held = hold ? this.result(previous) : null;
    const next = {
      ...previous,
      hold,
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repo.db.transaction(() => {
      this.repo.set("held", held);
      this.repo.set("program", next);
      this.repo.audit("HOLD", previous, next);
    })();
    this.held = held;
    this.program = next;
    this.notify("broadcast-state");
  }
  saveSettings(input: unknown) {
    const next = settingsSchema.parse(input);
    this.repo.db.transaction(() => {
      this.repo.audit("SETTINGS", this.settings, next);
      this.repo.set("settings", next);
    })();
    this.settings = next;
    this.notify("broadcast-state");
  }
  favorite(id: string) {
    this.favorites = this.favorites.includes(id)
      ? this.favorites.filter((x) => x !== id)
      : [...this.favorites, id];
    this.repo.set("favorites", this.favorites);
    return this.favorites;
  }
  private save(
    target: "program" | "preview",
    next: BroadcastState,
    action: string,
  ) {
    this.repo.db.transaction(() => {
      this.repo.set(target, next);
      if (action === "TAKE") this.repo.set("programSettings", this.settings);
      this.repo.audit(action, this[target], next);
    })();
    this[target] = next;
    if (action === "TAKE") this.programSettings = this.settings;
    this.notify("broadcast-state");
  }
  notify(event: string) {
    this.sequence++;
    this.emit(event);
  }
  active() {
    return [
      ...new Map(
        [this.program, this.preview].map((s) => [resultKey(s), s]),
      ).values(),
    ];
  }
}
