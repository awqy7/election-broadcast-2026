import { z } from "zod";
export const digits = z.string().regex(/^\d+$/);
export const integer = digits
  .transform(Number)
  .refine(Number.isSafeInteger)
  .or(z.number().int().nonnegative().safe());
export const decimal = z
  .string()
  .regex(/^\d+([,.]\d+)?$/)
  .transform((s) => Number(s.replace(",", ".")))
  .or(z.number().finite().nonnegative());
export const percent = decimal.refine((v) => v >= 0 && v <= 100);
const metadata = {
  dg: z.string(),
  hg: z.string(),
  idg: digits,
  f: z.enum(["o", "s"]),
};
export const EA11Schema = z
  .object({
    ...metadata,
    arq: z.array(z.object({ tp: z.string(), dir: z.string() }).passthrough()),
    pl: z.array(
      z
        .object({
          cd: digits,
          c: z.string(),
          dt: z.string(),
          e: z.array(
            z
              .object({
                cd: digits,
                nm: z.string(),
                t: z.enum(["1", "2"]),
                abr: z.array(
                  z
                    .object({
                      cd: z.string(),
                      cp: z.array(
                        z.object({ cd: digits, ds: z.string() }).passthrough(),
                      ),
                    })
                    .passthrough(),
                ),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export const EA12Schema = z
  .object({
    ...metadata,
    abr: z.array(
      z
        .object({
          cd: z.string(),
          ds: z.string(),
          mu: z.array(
            z
              .object({ cd: z.string().regex(/^\d{5}$/), nm: z.string() })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export const sectionsSchema = z
  .object({ ts: integer, st: integer, pst: percent, snt: integer })
  .passthrough()
  .refine((s) => s.st + s.snt === s.ts, "Seções inconsistentes");
const accompanying = {
  ...metadata,
  ele: digits,
  t: z.enum(["1", "2"]),
  abr: z.array(
    z
      .object({
        and: z.enum(["n", "p", "f"]),
        tpabr: z.string(),
        cdabr: z.string(),
        dt: z.string(),
        ht: z.string(),
        s: sectionsSchema,
      })
      .passthrough(),
  ),
};
export const EA14Schema = z.object(accompanying).passthrough();
export const EA15Schema = z.object(accompanying).passthrough();
const substitute = z
  .object({ nm: z.string(), nmu: z.string(), sgp: z.string() })
  .passthrough();
export const candidateSchema = z
  .object({
    n: digits,
    sqcand: digits,
    nm: z.string().min(1),
    nmu: z.string().min(1),
    vap: integer,
    pvap: percent,
    dvt: z.string().optional(),
    e: z.enum(["s", "n", ""]),
    st: z.string(),
    subs: z.array(substitute).optional(),
    vs: z
      .array(substitute.extend({ tp: z.string(), sqcand: digits }))
      .optional(),
  })
  .passthrough();
export const EA20Schema = z
  .object({
    ...metadata,
    ele: digits,
    t: z.enum(["1", "2"]),
    tpabr: z.enum(["br", "uf", "mu", "zona"]),
    cdabr: z.string(),
    dt: z.string(),
    ht: z.string(),
    tf: z.enum(["s", "n"]),
    and: z.enum(["n", "p", "f"]),
    md: z.enum(["e", "s", "n"]).optional(),
    dv: z.enum(["s", "n"]),
    s: sectionsSchema,
    carg: z
      .array(
        z
          .object({
            cd: digits,
            agr: z.array(
              z
                .object({
                  par: z.array(
                    z
                      .object({
                        n: digits,
                        sg: z.string(),
                        nm: z.string(),
                        cand: z.array(candidateSchema).optional(),
                      })
                      .passthrough(),
                  ),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export type EA11 = z.infer<typeof EA11Schema>;
export type EA20 = z.infer<typeof EA20Schema>;
