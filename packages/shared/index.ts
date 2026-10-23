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
export interface ElectionStats {
  electorateTotal: number;
  turnout: number;
  turnoutPercent: number;
  abstention: number;
  abstentionPercent: number;
  totalVotes: number;
  validVotes: number;
  validPercent: number;
  nominalVotes: number;
  blankVotes: number;
  blankPercent: number;
  nullVotes: number;
  nullPercent: number;
  annulledVotes: number;
  subjudiceVotes: number;
}
export interface ElectionResult {
  source: "TSE" | "SIMULAÇÃO";
  environment: "oficial" | "mock" | "simulado2026";
  electionId: string;
  scopeType: "br" | "uf" | "mu" | "zona";
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
  municipalityCode?: string | null;
  zoneCode?: string | null;
  stats?: ElectionStats;
}
export const sortCandidates = (c: CandidateResult[]) =>
  [...c].sort(
    (a, b) =>
      b.votes - a.votes ||
      Number(a.number) - Number(b.number) ||
      a.id.localeCompare(b.id),
  );

/**
 * Nome editorial usado no video. O override de presidente evita que o TSE
 * publique "LUIZ INÁCIO LULA DA SILVA" no lower third; ele nunca deve valer
 * para governador, senador ou deputado, que podem usar os mesmos numeros.
 */
export function displayCandidateName(
  candidate:
    Pick<CandidateResult, "number" | "ballotName" | "name"> | null | undefined,
  officeCode: Office,
) {
  const name = candidate?.ballotName || candidate?.name || "";
  if (officeCode !== "0001") return name;
  if (candidate?.number === "22") return "FLÁVIO BOLSONARO";
  if (candidate?.number === "13") return "LULA";
  return name;
}
export const stateSchema = z
  .object({
    scene: z
      .enum([
        "top",
        "candidate",
        "compare",
        "progress",
        "ticker",
        "stats",
        "runoff",
        "fullscreen",
        "projection",
      ])
      .default("progress"),
    scope: z
      .enum(["municipality", "state", "br", "zone"])
      .default("municipality"),
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
        "fullscreen",
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
    showVice: z.boolean().default(true),
    showStats: z.boolean().default(true),
    showEffects: z.boolean().default(true),
    safeArea: z.number().min(0).max(180).default(60),
    municipalityCode: z
      .string()
      .regex(/^\d{5}$/)
      .nullable()
      .default(null),
    zoneCode: z
      .string()
      .regex(/^\d{1,4}$/)
      .nullable()
      .default(null),
    fullscreenTab: z.enum(["map", "duel"]).default("map"),
    focusedUf: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .nullable()
      .default(null)
      .transform((v) => v?.toUpperCase() ?? null),
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
  round?: "1" | "2";
  uf?: string;
  ufName?: string;
  map?: import("./brazil-map-data").BrazilMapOfficialData | null;
}
export const resultKey = (
  s: Pick<BroadcastState, "scope" | "officeCode"> & {
    municipalityCode?: string | null;
    zoneCode?: string | null;
  },
) => {
  if (s.scope === "zone") {
    return `zone:${s.municipalityCode ?? "default"}:${s.zoneCode ?? "default"}:${s.officeCode}`;
  }
  if (s.scope === "municipality" && s.municipalityCode) {
    return `municipality:${s.municipalityCode}:${s.officeCode}`;
  }
  return `${s.scope}:${s.officeCode}`;
};
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
    (p.scope && p.scope !== previous.scope) ||
    (p.municipalityCode !== undefined &&
      p.municipalityCode !== previous.municipalityCode) ||
    (p.zoneCode !== undefined && p.zoneCode !== previous.zoneCode)
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

export interface RunoffProjection {
  hasRunoff: boolean;
  leader: CandidateResult | null;
  runnerUp: CandidateResult | null;
  marginVotes: number;
  marginPercent: number;
  totalValidVotes: number;
  estimatedRemainingVotes: number;
  votesToSealVictory: number;
  isMathematicallyElected: boolean;
  statusLabel: string;
}

export function calculateRunoffProjection(
  result: ElectionResult | null,
  round: "1" | "2" = "2",
): RunoffProjection {
  if (!result || !result.candidates || result.candidates.length < 2) {
    return {
      hasRunoff: false,
      leader: result?.candidates?.[0] ?? null,
      runnerUp: null,
      marginVotes: 0,
      marginPercent: 0,
      totalValidVotes: 0,
      estimatedRemainingVotes: 0,
      votesToSealVictory: 0,
      isMathematicallyElected: false,
      statusLabel: "AGUARDANDO DADOS",
    };
  }

  const sorted = sortCandidates(result.candidates);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const marginVotes = Math.max(0, leader.votes - runnerUp.votes);
  const marginPercent = Math.max(0, leader.percentage - runnerUp.percentage);

  const countedValid =
    result.stats?.validVotes ||
    sorted.reduce((sum, c) => sum + (c.votes || 0), 0) ||
    1;

  let estimatedRemainingVotes = 0;
  if (
    result.sectionsTotal > 0 &&
    result.sectionsTotalized > 0 &&
    result.sectionsTotalized < result.sectionsTotal
  ) {
    const avgValidPerSection = countedValid / result.sectionsTotalized;
    const remainingSections = result.sectionsTotal - result.sectionsTotalized;
    estimatedRemainingVotes = Math.round(
      remainingSections * avgValidPerSection,
    );
  } else if (
    result.stats &&
    result.stats.electorateTotal > 0 &&
    result.stats.turnout > 0
  ) {
    const estimatedTotalValid = Math.round(
      result.stats.electorateTotal *
        (result.stats.turnoutPercent / 100) *
        (result.stats.validPercent / 100),
    );
    estimatedRemainingVotes = Math.max(0, estimatedTotalValid - countedValid);
  }

  const officialDeclared =
    result.mathematicallyDefined === "s" ||
    leader.officialStatus === "Eleito" ||
    leader.electedFlag === "s";
  const mathGuaranteed =
    result.sectionsTotalized > 0 &&
    (round === "2"
      ? estimatedRemainingVotes === 0
        ? leader.votes > runnerUp.votes
        : leader.votes > runnerUp.votes + estimatedRemainingVotes
      : leader.votes > (countedValid + estimatedRemainingVotes) / 2);
  const isMathematicallyElected = officialDeclared || mathGuaranteed;

  let votesToSealVictory = 0;
  if (!isMathematicallyElected && estimatedRemainingVotes > 0) {
    votesToSealVictory =
      round === "2"
        ? Math.max(
            0,
            Math.ceil(
              (runnerUp.votes + estimatedRemainingVotes - leader.votes) / 2,
            ) + 1,
          )
        : Math.max(
            0,
            Math.floor(
              (countedValid + estimatedRemainingVotes) / 2 - leader.votes,
            ) + 1,
          );
  }

  let statusLabel = "EM APURAÇÃO";
  if (isMathematicallyElected) {
    statusLabel =
      leader.officialStatus === "Eleito" ? "ELEITO" : "MATEMATICAMENTE ELEITO";
  } else if (result.percentageSectionsTotalized > 0) {
    statusLabel = "VIRADA POSSÍVEL";
  }

  return {
    hasRunoff: true,
    leader,
    runnerUp,
    marginVotes,
    marginPercent,
    totalValidVotes: countedValid,
    estimatedRemainingVotes,
    votesToSealVictory,
    isMathematicallyElected,
    statusLabel,
  };
}

export interface PartySeatsProjection {
  partyAcronym: string;
  partyName: string;
  totalVotes: number;
  percentage: number;
  initialSeats: number;
  leftoverSeats: number;
  totalSeats: number;
  electedCandidates: CandidateResult[];
}

export interface SeatsProjection {
  totalValidVotes: number;
  totalSeats: number;
  electoralQuotient: number;
  parties: PartySeatsProjection[];
}

export function calculateSeatsProjection(
  result: ElectionResult | null,
  totalSeats = 77,
): SeatsProjection {
  if (!result || !result.candidates || result.candidates.length === 0) {
    return {
      totalValidVotes: 0,
      totalSeats,
      electoralQuotient: 0,
      parties: [],
    };
  }

  const validVotes =
    result.stats?.validVotes ||
    result.candidates.reduce((sum, c) => sum + (c.votes || 0), 0) ||
    1;

  const rawQe = validVotes / totalSeats;
  const qeDec = rawQe - Math.floor(rawQe);
  const qe = qeDec >= 0.5 ? Math.ceil(rawQe) : Math.max(1, Math.floor(rawQe));

  const partyMap = new Map<
    string,
    {
      partyAcronym: string;
      partyName: string;
      candidates: CandidateResult[];
      totalVotes: number;
    }
  >();

  for (const cand of result.candidates) {
    const acronym = cand.partyAcronym || "IND";
    let entry = partyMap.get(acronym);
    if (!entry) {
      entry = {
        partyAcronym: acronym,
        partyName: cand.partyName || acronym,
        candidates: [],
        totalVotes: 0,
      };
      partyMap.set(acronym, entry);
    }
    entry.candidates.push(cand);
    entry.totalVotes += cand.votes;
  }

  const partyList = Array.from(partyMap.values()).map((p) => {
    p.candidates.sort((a, b) => b.votes - a.votes);
    const initialSeats = Math.floor(p.totalVotes / qe);
    return {
      partyAcronym: p.partyAcronym,
      partyName: p.partyName,
      totalVotes: p.totalVotes,
      percentage: (p.totalVotes / validVotes) * 100,
      initialSeats,
      leftoverSeats: 0,
      totalSeats: initialSeats,
      allCandidates: p.candidates,
      electedCandidates: [] as CandidateResult[],
    };
  });

  const allocatedSeats = partyList.reduce((acc, p) => acc + p.initialSeats, 0);
  const seatsToDistribute = Math.max(0, totalSeats - allocatedSeats);

  for (let i = 0; i < seatsToDistribute; i++) {
    let bestAverage = -1;
    let bestPartyIndex = -1;

    for (let j = 0; j < partyList.length; j++) {
      const p = partyList[j];
      const avg = p.totalVotes / (p.totalSeats + 1);
      if (avg > bestAverage) {
        bestAverage = avg;
        bestPartyIndex = j;
      }
    }

    if (bestPartyIndex >= 0) {
      partyList[bestPartyIndex].leftoverSeats++;
      partyList[bestPartyIndex].totalSeats++;
    } else {
      break;
    }
  }

  for (const p of partyList) {
    p.electedCandidates = p.allCandidates.slice(0, p.totalSeats);
  }

  partyList.sort(
    (a, b) => b.totalSeats - a.totalSeats || b.totalVotes - a.totalVotes,
  );

  return {
    totalValidVotes: validVotes,
    totalSeats,
    electoralQuotient: qe,
    parties: partyList.map((p) => ({
      partyAcronym: p.partyAcronym,
      partyName: p.partyName,
      totalVotes: p.totalVotes,
      percentage: p.percentage,
      initialSeats: p.initialSeats,
      leftoverSeats: p.leftoverSeats,
      totalSeats: p.totalSeats,
      electedCandidates: p.electedCandidates,
    })),
  };
}

export * from "./brazil-map-data";
