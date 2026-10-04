import { EA11Schema, EA12Schema, type EA11 } from "./schemas";
import { normalizeName, type Office } from "../shared";
export interface ElectionConfig {
  cycle: string;
  round: "1" | "2";
  pleito: string;
  federalElectionId: string;
  stateElectionId: string;
  districtElectionId: string;
  environment: "oficial" | "simulado2026";
  basePath?: string;
  host: string;
  date: string;
  directories: { tp: string; dir: string }[];
  validated: boolean;
}
export const initialElectionConfig: ElectionConfig = {
  cycle: "ele2026",
  round: "1",
  pleito: "3220",
  federalElectionId: "6257",
  stateElectionId: "6259",
  districtElectionId: "6261",
  environment: "oficial",
  host: "resultados.tse.jus.br",
  date: "04/10/2026",
  directories: [],
  validated: false,
};
export const simulationElectionConfig: ElectionConfig = {
  ...initialElectionConfig,
  host: "resultados-sim.tse.jus.br",
  basePath: "/simulado",
  environment: "simulado2026",
  pleito: "17801",
  federalElectionId: "21270",
  stateElectionId: "21272",
  districtElectionId: "21274",
  date: "26/04/2026",
};
export class ElectionConfigService {
  static fromEA11(
    input: unknown,
    base = initialElectionConfig,
  ): ElectionConfig {
    const doc = EA11Schema.parse(input);
    if (doc.f !== (base.environment === "oficial" ? "o" : "s"))
      throw new Error("TSE_SCHEMA_INVALID: ambiente EA11 incompatível");
    const p = doc.pl.find(
      (p) =>
        (base.environment === "oficial"
          ? p.dt === base.date
          : p.cd === base.pleito) &&
        p.e.some(
          (e) =>
            e.t === base.round &&
            e.abr.some((a) => a.cp.some((c) => Number(c.cd) === 1)),
        ),
    );
    if (!p) throw new Error("EA11: eleição ainda não publicada");
    const find = (office: number) =>
      p.e.find(
        (e) =>
          e.t === base.round &&
          e.abr.some((a) => a.cp.some((c) => Number(c.cd) === office)),
      )?.cd;
    const fed = find(1),
      state = find(3);
    if (!fed || !state) throw new Error("EA11: cargos obrigatórios ausentes");
    return {
      ...base,
      cycle: p.c,
      pleito: p.cd,
      date: p.dt,
      federalElectionId: fed,
      stateElectionId: state,
      districtElectionId: find(25) || base.districtElectionId,
      directories: doc.arq,
      validated: true,
    };
  }
}
export interface Municipality {
  code: string;
  name: string;
  uf: string;
  stateName: string;
  sourceIdg: string;
}
export class MunicipalityService {
  static resolveMunicipality(
    uf: string,
    name: string,
    input: unknown,
  ): Municipality {
    const doc = EA12Schema.parse(input);
    const state = doc.abr.find((a) => a.cd.toLowerCase() === uf.toLowerCase());
    const matches = state?.mu.filter(
      (m) => normalizeName(m.nm) === normalizeName(name),
    );
    if (matches?.length !== 1 || !state)
      throw new Error("MUNICIPALITY_NOT_FOUND");
    return {
      code: matches[0].cd,
      name: matches[0].nm,
      uf: uf.toLowerCase(),
      stateName: state.ds,
      sourceIdg: doc.idg,
    };
  }
}
export class TseUrlBuilder {
  constructor(public config: ElectionConfig) {
    if (
      !/^[a-z0-9.-]+\.tse\.jus\.br$/.test(config.host) &&
      config.host !== "resultados.tse.jus.br"
    )
      throw new Error("Host deve pertencer ao TSE");
  }
  ea11() {
    return `https://${this.config.host}${this.config.basePath ?? ""}/${this.config.environment}/comum/config/ele-c.json`;
  }
  election(office: Office) {
    return office === "0001"
      ? this.config.federalElectionId
      : this.config.stateElectionId;
  }
  private directory(tp: string, election: string, uf = "br") {
    if (!this.config.validated) throw new Error("EA11 não validado");
    const template = this.config.directories.find((a) => a.tp === tp)?.dir;
    if (!template) throw new Error(`EA11: diretório ${tp} ausente`);
    const tokens: Record<string, string> = {
      base: `https://${this.config.host}${this.config.basePath ?? ""}`,
      ambiente: this.config.environment,
      ciclo: this.config.cycle,
      cd_eleicao: election,
      cd_pleito: this.config.pleito,
      uf,
    };
    const value = template.replace(
      /<([^>]+)>/g,
      (_, key: string) => tokens[key] ?? `<${key}>`,
    );
    const url = new URL(value);
    if (
      value.includes("<") ||
      url.protocol !== "https:" ||
      url.host !== this.config.host ||
      url.pathname.includes("..")
    )
      throw new Error("Diretório EA11 inválido");
    return value;
  }
  ea12(election = this.config.stateElectionId) {
    return `${this.directory("cm", election)}/mun-e${election.padStart(6, "0")}-cm.json`;
  }
  ea20(
    office: Office,
    scope: "municipality" | "state" | "br",
    uf: string,
    municipality?: string,
  ) {
    if (scope === "br" && office !== "0001")
      throw new Error("Cargo não possui resultado Brasil");
    if (!/^[a-z]{2}$/.test(uf)) throw new Error("UF inválida");
    if (scope === "municipality" && !/^\d{5}$/.test(municipality ?? ""))
      throw new Error("MUNICIPALITY_NOT_FOUND");
    const e = this.election(office),
      area = scope === "br" ? "br" : uf;
    return `${this.directory("u", e, area)}/${area}${scope === "municipality" ? municipality : ""}-c${office}-e${e.padStart(6, "0")}-u.json`;
  }
  accompanying(uf: string) {
    const e = this.config.stateElectionId;
    return `${this.directory("ab", e, uf)}/${uf}-e${e.padStart(6, "0")}-ab.json`;
  }
  photo(office: Office, uf: string, sqcand: string) {
    if (!/^\d+$/.test(sqcand)) throw new Error("sqcand inválido");
    return `${this.directory("ft", this.election(office), office === "0001" ? "br" : uf)}/${sqcand}.jpeg`;
  }
}
export const select2026 = (doc: EA11) =>
  doc.pl.filter((p) => p.c === "ele2026");
