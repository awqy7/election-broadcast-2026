import { createHash } from "node:crypto";
import { EA20Schema } from "./schemas";
import {
  offices,
  sortCandidates,
  type ElectionResult,
  type Office,
} from "../shared";
export const hash = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export function tseDate(date: string, time: string): string | null {
  if (!date && !time) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!m || !/^\d{2}:\d{2}:\d{2}$/.test(time))
    throw new Error("TSE_SCHEMA_INVALID: data");
  const value = `${m[3]}-${m[2]}-${m[1]}T${time}-03:00`;
  if (
    !Number.isFinite(Date.parse(value)) ||
    Number(time.slice(0, 2)) > 23 ||
    new Date(Date.parse(value) - 3 * 3600000).toISOString().slice(0, 10) !==
      `${m[3]}-${m[2]}-${m[1]}`
  )
    throw new Error("TSE_SCHEMA_INVALID: data");
  return new Date(value).toISOString();
}
export class ResultNormalizer {
  static normalize(
    input: unknown,
    context: {
      office: Office;
      scopeType: "br" | "uf" | "mu";
      scopeCode: string;
      scopeName: string;
      electionId: string;
      round: string;
      mode: "mock" | "tse" | "tse-sim";
      resource: string;
    },
  ): ElectionResult {
    const d = EA20Schema.parse(input);
    if (
      d.f !== (context.mode === "tse" ? "o" : "s") ||
      Number(d.ele) !== Number(context.electionId) ||
      d.t !== context.round ||
      d.tpabr !== context.scopeType ||
      d.cdabr.toLowerCase() !== context.scopeCode.toLowerCase()
    )
      throw new Error(
        "TSE_SCHEMA_INVALID: origem/eleição/abrangência incompatível",
      );
    const cargo = d.carg.find((c) => c.cd.padStart(4, "0") === context.office);
    if (!cargo) throw new Error("TSE_SCHEMA_INVALID: cargo ausente");
    const candidates = cargo.agr.flatMap((a) =>
      a.par.flatMap((p) =>
        (p.cand ?? []).map((c) => ({
          id: c.sqcand,
          sqcand: c.sqcand,
          number: c.n,
          name: c.nm,
          ballotName: c.nmu,
          partyNumber: p.n,
          partyAcronym: p.sg,
          partyName: p.nm,
          votes: c.vap,
          percentage: c.pvap,
          destination: c.dvt || null,
          electedFlag: c.e || null,
          officialStatus: c.st || null,
          photoUrl: null,
          substitutes: c.subs ?? [],
          viceOrAlternates: c.vs ?? [],
        })),
      ),
    );
    if (new Set(candidates.map((c) => c.id)).size !== candidates.length)
      throw new Error("TSE_SCHEMA_INVALID: candidato duplicado");
    const generatedAt = tseDate(d.dg, d.hg);
    if (!generatedAt) throw new Error("TSE_SCHEMA_INVALID: geração ausente");
    return {
      source: context.mode === "mock" ? "SIMULAÇÃO" : "TSE",
      environment:
        context.mode === "tse"
          ? "oficial"
          : context.mode === "tse-sim"
            ? "simulado2026"
            : "mock",
      electionId: d.ele,
      scopeType: context.scopeType,
      scopeCode: d.cdabr,
      scopeName: context.scopeName,
      officeCode: context.office,
      officeName: offices[context.office],
      generatedAt,
      totalizationAt: tseDate(d.dt, d.ht),
      final: d.tf === "s",
      progressStatus: d.and,
      mathematicallyDefined: d.md ?? null,
      disclosureAllowed: d.dv === "s",
      sectionsTotal: d.s.ts,
      sectionsTotalized: d.s.st,
      sectionsPending: d.s.snt,
      percentageSectionsTotalized: d.s.pst,
      candidates: sortCandidates(candidates),
      sourceResource: context.resource,
      sourceIdg: d.idg,
      sourceGeneratedAt: generatedAt,
      receivedAt: new Date().toISOString(),
      hash: hash(input),
    };
  }
}
