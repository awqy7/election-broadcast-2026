import { z } from "zod";
export const offices = {
  "0001": "Presidente",
  "0003": "Governador",
  "0005": "Senador",
  "0006": "Deputado Federal",
  "0007": "Deputado Estadual",
  "0008": "Deputado Distrital",
} as const;
export const officeSchema = z.enum([
  "0001",
  "0003",
  "0005",
  "0006",
  "0007",
  "0008",
]);
export type Office = z.infer<typeof officeSchema>;
export const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export const formatVotes = (v: number) =>
  new Intl.NumberFormat("pt-BR").format(v);
export const formatPercent = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(v) + "%";
export const formatTime = (s: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(s));
export const clampPercent = (n: number) => Math.max(0, Math.min(100, n));
export interface CandidateResult {
  id: string;
  sqcand: string;
  number: string;
  name: string;
  ballotName: string;
  partyNumber: string;
  partyAcronym: string;
  partyName: string;
  votes: number;
  percentage: number;
  destination: string | null;
  electedFlag: string | null;
  officialStatus: string | null;
  photoUrl: string | null;
  substitutes: { nm: string; nmu: string; sgp: string }[];
  viceOrAlternates: {
    nm: string;
    nmu: string;
    sgp: string;
    tp: string;
    sqcand: string;
  }[];
}
export interface ElectionResult {
  source: "TSE" | "SIMULAÇÃO";
  environment: "oficial" | "mock" | "simulado2026";
  electionId: string;
  scopeType: "br" | "uf" | "mu";
  scopeCode: string;
  scopeName: string;
  officeCode: Office;
  officeName: string;
  generatedAt: string;
  totalizationAt: string | null;
  final: boolean;
  progressStatus: string;
  mathematicallyDefined: string | null;
  disclosureAllowed: boolean;
  sectionsTotal: number;
  sectionsTotalized: number;
  sectionsPending: number;
  percentageSectionsTotalized: number;
  candidates: CandidateResult[];
  sourceResource: string;
  sourceIdg: string;
  sourceGeneratedAt: string;
  receivedAt: string;
  hash: string;
}
export const sortCandidates = (c: CandidateResult[]) =>
  [...c].sort(
    (a, b) =>
      b.votes - a.votes ||
      Number(a.number) - Number(b.number) ||
      a.id.localeCompare(b.id),
  );
export const stateSchema = z
  .object({
    scene: z
      .enum(["top", "candidate", "compare", "progress", "ticker"])
      .default("top"),
    scope: z.enum(["municipality", "state", "br"]).default("municipality"),
    officeCode: officeSchema.default("0003"),
    selectedCandidateIds: z.array(z.string().max(40)).max(4).default([]),
    topCount: z.number().int().min(2).max(6).default(4),
    position: z
      .enum([
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ])
      .default("bottom-center"),
    theme: z.literal("broadcast").default("broadcast"),
    visible: z.boolean().default(false),
    hold: z.boolean().default(false),
    scale: z.number().min(0.4).max(1).default(1),
    showParty: z.boolean().default(true),
    showVotes: z.boolean().default(true),
    showPhoto: z.boolean().default(true),
    showTimestamp: z.boolean().default(true),
    safeArea: z.number().min(0).max(180).default(60),
    revision: z.number().int().nonnegative().default(0),
    updatedAt: z.string().default(() => new Date().toISOString()),
  })
  .strict();
export type BroadcastState = z.infer<typeof stateSchema>;
export const statePatchSchema = stateSchema
  .partial()
  .omit({ revision: true, updatedAt: true });
export const settingsSchema = z.object({
  stationName: z.string().max(80).default(""),
  stationLogo: z
    .string()
    .regex(/^\/branding\/logo-[a-f0-9]+\.(png|jpeg|webp)$/)
    .nullable()
    .default(null),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0752a0"),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Output {
  state: BroadcastState;
  result: ElectionResult | null;
  settings: Settings;
  dataMode: "mock" | "tse" | "tse-sim";
  sequence: number;
}
export const resultKey = (s: Pick<BroadcastState, "scope" | "officeCode">) =>
  `${s.scope}:${s.officeCode}`;
export function reduceState(
  previous: BroadcastState,
  patch: unknown,
): BroadcastState {
  const p = statePatchSchema.parse(patch);
  const next = { ...previous, ...p };
  if (next.scope === "br" && next.officeCode !== "0001")
    throw new Error("Brasil permite apenas Presidente");
  if (
    (p.officeCode && p.officeCode !== previous.officeCode) ||
    (p.scope && p.scope !== previous.scope)
  )
    next.selectedCandidateIds = [];
  if (p.scene === "candidate")
    next.selectedCandidateIds = next.selectedCandidateIds.slice(0, 1);
  return stateSchema.parse({
    ...next,
    revision: previous.revision + 1,
    updatedAt: new Date().toISOString(),
  });
}
export const ERROR_MESSAGES: Record<string, string> = {
  TSE_DNS_ERROR: "Não foi possível resolver o endereço do TSE.",
  TSE_TIMEOUT: "O TSE não respondeu no prazo.",
  TSE_HTTP_ERROR: "A fonte retornou erro HTTP.",
  TSE_RATE_LIMIT: "Consultas suspensas temporariamente pelo limite da fonte.",
  TSE_SCHEMA_INVALID: "Arquivo oficial inválido; último resultado preservado.",
  TSE_STALE: "Aguardando atualização da fonte.",
  MUNICIPALITY_NOT_FOUND: "Município não localizado no EA12.",
  DATABASE_ERROR: "Falha no banco de dados.",
  SSE_DISCONNECTED: "Conexão interrompida; reconectando.",
};
