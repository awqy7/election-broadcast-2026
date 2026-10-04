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
      mu: [{ cd: "99999", nm: "TEÓFILO OTONI" }],
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
  document(office: Office, scope: "municipality" | "state" | "br") {
    if (this.offline) throw new Error("TSE_HTTP_ERROR");
    if (this.timeout) throw new Error("TSE_TIMEOUT");
    if (this.partial) return JSON.parse('{"ele":');
    if (this.invalid) return { invalid: true };
    const names = [
      "Candidata Simulada A",
      "Candidato Simulado B",
      "Candidata Simulada C",
      "Candidato Simulado D",
      "Candidata Simulada E",
      "Candidato Simulado F",
    ];
    const base = [425, 281, 187, 67, 25, 15];
    if (this.swapped) [base[0], base[1]] = [base[1], base[0]];
    const votes = base.map(
      (v, i) =>
        Math.round(v * this.progress) +
        (i === 0 ? this.extraA : i === 1 ? this.extraB : 0),
    );
    const sum = votes.reduce((a, b) => a + b, 0);
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
    return {
      ele:
        office === "0001"
          ? mockConfig.federalElectionId
          : mockConfig.stateElectionId,
      t: "1",
      f: "s",
      tpabr: scope === "br" ? "br" : scope === "state" ? "uf" : "mu",
      cdabr: scope === "br" ? "br" : scope === "state" ? "mg" : "99999",
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
      carg: [
        {
          cd: office,
          agr: [
            {
              par: names.map((name, i) => ({
                n: String(90 + i),
                sg: `SIM${i + 1}`,
                nm: `Partido fictício ${i + 1}`,
                cand: [
                  {
                    n: String(90 + i),
                    sqcand: `${office}${i + 1}${this.substituted && i === 0 ? "9" : "0"}`,
                    nm:
                      this.substituted && i === 0
                        ? "Substituta Simulada"
                        : name,
                    nmu:
                      this.substituted && i === 0
                        ? "Substituta Simulada"
                        : name,
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
                        ? [{ nm: name, nmu: name, sgp: "SIM1" }]
                        : [],
                    vs: [],
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
