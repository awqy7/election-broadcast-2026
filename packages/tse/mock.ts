import { initialElectionConfig } from "./config";
import type { Office } from "../shared";
export const mockMunicipalityDocument = {
  dg: "04/10/2026",
  hg: "18:00:00",
  idg: "1",
  f: "s",
  abr: [
    {
      cd: "mg",
      ds: "Minas Gerais",
      mu: [
        { cd: "99999", nm: "TEÓFILO OTONI", z: ["0269"] },
        {
          cd: "41238",
          nm: "BELO HORIZONTE",
          z: ["0028", "0029", "0030", "0031"],
        },
        { cd: "40010", nm: "ABADIA DOS DOURADOS", z: ["0096"] },
        { cd: "54011", nm: "UBERLÂNDIA", z: ["0278", "0279", "0314"] },
      ],
    },
  ],
};
export const mockConfig = {
  ...initialElectionConfig,
  validated: true,
  directories: [
    { tp: "cm", dir: "<base>/<ambiente>/<ciclo>/<cd_eleicao>/config" },
    ...["u", "ab"].map((tp) => ({
      tp,
      dir: "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    })),
    { tp: "ft", dir: "<base>/<ambiente>/<ciclo>/<cd_eleicao>/fotos/<uf>" },
  ],
};
export class MockSource {
  progress = 0;
  tick = 0;
  offline = false;
  invalid = false;
  partial = false;
  timeout = false;
  missingPhoto = false;
  swapped = false;
  status = "";
  substituted = false;
  extraA = 0;
  extraB = 0;
  auto = true;
  steps = [0, 3, 12, 25, 48, 67, 82, 95, 99, 100];
  command(action: string) {
    if (action === "reset") {
      Object.assign(this, new MockSource());
      this.auto = false;
      return;
    }
    if (action.startsWith("progress:"))
      this.progress = Number(action.split(":")[1]);
    else if (action === "offline") this.offline = true;
    else if (action === "online") {
      this.offline = false;
      this.invalid = false;
      this.partial = false;
      this.timeout = false;
    } else if (action === "invalid") this.invalid = true;
    else if (action === "partial") this.partial = true;
    else if (action === "timeout") this.timeout = true;
    else if (action === "swap") this.swapped = !this.swapped;
    else if (action === "photo") this.missingPhoto = true;
    else if (action === "substitute") this.substituted = true;
    else if (action === "a") this.extraA += 1000;
    else if (action === "b") this.extraB += 1000;
    else if (action === "pause") this.auto = !this.auto;
    else this.status = action;
    this.tick++;
  }
  advance() {
    if (this.auto) {
      this.tick++;
      this.progress =
        this.steps[Math.min(Math.floor(this.tick / 2), this.steps.length - 1)];
      if (this.tick === 9) this.swapped = true;
    }
  }
  document(
    office: Office,
    scope: "municipality" | "state" | "br" | "zone",
    municipalityCode?: string,
    zoneCode?: string,
  ) {
    if (this.offline) throw new Error("TSE_HTTP_ERROR");
    if (this.timeout) throw new Error("TSE_TIMEOUT");
    if (this.partial) return JSON.parse('{"ele":');
    if (this.invalid) return { invalid: true };
    const isPresidential = office === "0001";
    const isRunoff = isPresidential || this.status === "runoff";

    const candidateProfiles = isPresidential
      ? [
          {
            number: "22",
            partyNumber: "22",
            partyAcronym: "PL",
            partyName: "Partido Liberal",
            name: "Flávio Bolsonaro",
            ballotName: "FLÁVIO BOLSONARO",
            base: 5180,
            vice: "Michelle Bolsonaro",
            viceParty: "PL",
          },
          {
            number: "13",
            partyNumber: "13",
            partyAcronym: "PT",
            partyName: "Partido dos Trabalhadores",
            name: "Lula",
            ballotName: "LULA",
            base: 4820,
            vice: "Geraldo Alckmin",
            viceParty: "PSB",
          },
        ]
      : isRunoff
        ? [
            {
              number: "22",
              partyNumber: "22",
              partyAcronym: "PL",
              partyName: "Partido Liberal",
              name: "CANDIDATO 22",
              ballotName: "CANDIDATO 22",
              base: 515,
              vice: "Vice Candidato 22",
            },
            {
              number: "13",
              partyNumber: "13",
              partyAcronym: "PT",
              partyName: "Partido dos Trabalhadores",
              name: "CANDIDATO 13",
              ballotName: "CANDIDATO 13",
              base: 485,
              vice: "Vice Candidato 13",
            },
          ]
        : [
            {
              number: "90",
              partyNumber: "90",
              partyAcronym: "SIM1",
              partyName: "Partido fictício 1",
              name: "Candidata Simulada A",
              ballotName: "Candidata Simulada A",
              base: 425,
              vice: "Vice Simulado 1",
            },
            {
              number: "91",
              partyNumber: "91",
              partyAcronym: "SIM2",
              partyName: "Partido fictício 2",
              name: "Candidato Simulado B",
              ballotName: "Candidato Simulado B",
              base: 281,
              vice: "Vice Simulado 2",
            },
            {
              number: "92",
              partyNumber: "92",
              partyAcronym: "SIM3",
              partyName: "Partido fictício 3",
              name: "Candidata Simulada C",
              ballotName: "Candidata Simulada C",
              base: 187,
              vice: "Vice Simulado 3",
            },
            {
              number: "93",
              partyNumber: "93",
              partyAcronym: "SIM4",
              partyName: "Partido fictício 4",
              name: "Candidato Simulado D",
              ballotName: "Candidato Simulado D",
              base: 67,
              vice: "Vice Simulado 4",
            },
            {
              number: "94",
              partyNumber: "94",
              partyAcronym: "SIM5",
              partyName: "Partido fictício 5",
              name: "Candidata Simulada E",
              ballotName: "Candidata Simulada E",
              base: 25,
              vice: "Vice Simulado 5",
            },
            {
              number: "95",
              partyNumber: "95",
              partyAcronym: "SIM6",
              partyName: "Partido fictício 6",
              name: "Candidato Simulado F",
              ballotName: "Candidato Simulado F",
              base: 15,
              vice: "Vice Simulado 6",
            },
          ];

    const base = candidateProfiles.map((c) => c.base);
    if (this.swapped && base.length >= 2)
      [base[0], base[1]] = [base[1], base[0]];
    const votes = base.map(
      (v, i) =>
        Math.round(v * this.progress) +
        (i === 0 ? this.extraA : i === 1 ? this.extraB : 0),
    );
    const sum = votes.reduce((a, b) => a + b, 0);
    const blankVotes = Math.round(sum * 0.04);
    const nullVotes = Math.round(sum * 0.03);
    const turnoutVotes = sum + blankVotes + nullVotes;
    const electorate = Math.round(turnoutVotes / 0.82) || 1000;
    const abstention = electorate - turnoutVotes;
    const now = new Date();
    const date = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }).format(now);
    const time = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(now);
    const tpabr =
      scope === "br"
        ? "br"
        : scope === "state"
          ? "uf"
          : scope === "zone"
            ? "zona"
            : "mu";
    const cdabr =
      scope === "br"
        ? "br"
        : scope === "state"
          ? "mg"
          : scope === "zone"
            ? (zoneCode ?? "0269")
            : (municipalityCode ?? "99999");
    return {
      ele:
        office === "0001"
          ? mockConfig.federalElectionId
          : mockConfig.stateElectionId,
      t: "1",
      f: "s",
      tpabr,
      cdabr,
      dg: date,
      hg: time,
      idg: String(this.tick),
      dt: date,
      ht: time,
      tf: this.progress === 100 ? "s" : "n",
      and: this.progress === 0 ? "n" : this.progress === 100 ? "f" : "p",
      md: "n",
      dv: "s",
      s: {
        ts: "1000",
        st: String(this.progress * 10),
        snt: String(1000 - this.progress * 10),
        pst: String(this.progress),
      },
      e: {
        te: String(electorate),
        c: String(turnoutVotes),
        pc: electorate
          ? ((turnoutVotes / electorate) * 100).toFixed(2)
          : "0,00",
        a: String(abstention),
        pa: electorate ? ((abstention / electorate) * 100).toFixed(2) : "0,00",
      },
      v: {
        tv: String(turnoutVotes),
        vv: String(sum),
        pvv: turnoutVotes ? ((sum / turnoutVotes) * 100).toFixed(2) : "100,00",
        vnom: String(sum),
        pvnom: "100,00",
        vb: String(blankVotes),
        pvb: turnoutVotes
          ? ((blankVotes / turnoutVotes) * 100).toFixed(2)
          : "0,00",
        vn: String(nullVotes),
        pvn: turnoutVotes
          ? ((nullVotes / turnoutVotes) * 100).toFixed(2)
          : "0,00",
        van: "0",
        pvan: "0,00",
        vansj: "0",
        pvansj: "0,00",
      },
      carg: [
        {
          cd: office,
          agr: [
            {
              par: candidateProfiles.map((cand, i) => ({
                n: cand.partyNumber,
                sg: cand.partyAcronym,
                nm: cand.partyName,
                cand: [
                  {
                    n: cand.number,
                    sqcand: `${office}${i + 1}${this.substituted && i === 0 ? "9" : "0"}`,
                    nm:
                      this.substituted && i === 0
                        ? "Substituta Simulada"
                        : cand.name,
                    nmu:
                      this.substituted && i === 0
                        ? "Substituta Simulada"
                        : cand.ballotName,
                    vap: String(votes[i]),
                    pvap: sum ? ((votes[i] / sum) * 100).toFixed(2) : "0",
                    dvt:
                      i === 2 && this.status === "annulled"
                        ? "Anulado"
                        : i === 3 && this.status === "subjudice"
                          ? "Anulado sub judice"
                          : "Válido",
                    e:
                      this.progress === 100 && i < 2 && this.status === "runoff"
                        ? "s"
                        : "n",
                    st:
                      this.progress === 100 && this.status === "runoff"
                        ? i < 2
                          ? "2º turno"
                          : "Não eleito"
                        : "",
                    subs:
                      this.substituted && i === 0
                        ? [
                            {
                              nm: cand.name,
                              nmu: cand.name,
                              sgp: cand.partyAcronym,
                            },
                          ]
                        : [],
                    vs: [
                      {
                        tp: "v",
                        sqcand: `${office}${i + 1}5`,
                        nm: cand.vice,
                        nmu: cand.vice,
                        sgp:
                          (cand as { viceParty?: string }).viceParty ??
                          cand.partyAcronym,
                      },
                    ],
                  },
                ],
              })),
            },
          ],
        },
      ],
    };
  }
}
