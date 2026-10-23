import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  clampPercent,
  formatPercent,
  formatTime,
  formatVotes,
  offices,
  sortCandidates,
  calculateRunoffProjection,
  calculateSeatsProjection,
  BRAZIL_STATES_GEO,
  calculateBrazilMapResults,
  displayCandidateName,
  type BroadcastState,
  type CandidateResult,
  type ElectionResult,
  type Output,
} from "../../../packages/shared";
import { useOutput } from "./connection";

function AnimatedNumber({
  value,
  percent = false,
}: {
  value: number;
  percent?: boolean;
}) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let id = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / 380);
      setDisplay(from + (value - from) * (1 - (1 - p) ** 3));
      if (p < 1) id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <>{percent ? formatPercent(display) : formatVotes(Math.round(display))}</>
  );
}
export function CandidatePhoto({ candidate }: { candidate: CandidateResult }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [candidate.photoUrl]);
  return (
    <div className="candidate-photo">
      {candidate.photoUrl && !failed ? (
        <img src={candidate.photoUrl} onError={() => setFailed(true)} alt="" />
      ) : (
        <svg viewBox="0 0 80 90" aria-hidden="true">
          <circle cx="40" cy="29" r="16" />
          <path d="M10 87V76c0-34 60-34 60 0v11" />
        </svg>
      )}
    </div>
  );
}
function VoteBar({
  percentage,
  index = 0,
}: {
  percentage: number;
  index?: number;
}) {
  return (
    <div className="vote-track">
      <span
        style={{
          width: `${clampPercent(percentage)}%`,
          background: [
            "#0864b9",
            "#2995ca",
            "#51769d",
            "#568e9a",
            "#767fab",
            "#5186b0",
          ][index % 6],
        }}
      />
    </div>
  );
}
function CandidateRow({
  candidate,
  index,
  state,
  compact = false,
}: {
  candidate: CandidateResult;
  index: number;
  state: BroadcastState;
  compact?: boolean;
}) {
  return (
    <div
      className={`candidate-row ${compact ? "compact" : ""}`}
      data-candidate={candidate.id}
      style={{ "--row-index": index } as CSSProperties}
    >
      {state.showPhoto && <CandidatePhoto candidate={candidate} />}
      <div className="candidate-identity">
        <strong>{displayCandidateName(candidate, state.officeCode)}</strong>
        {state.showParty && (
          <small>
            {candidate.partyAcronym} <span>• {candidate.number}</span>
          </small>
        )}
        {candidate.officialStatus && (
          <small className="official-status">{candidate.officialStatus}</small>
        )}
        {candidate.destination && candidate.destination !== "Válido" && (
          <small>{candidate.destination}</small>
        )}
      </div>
      <VoteBar percentage={candidate.percentage} index={index} />
      <b className="percentage">
        <AnimatedNumber value={candidate.percentage} percent />
      </b>
      {state.showVotes && (
        <div className="votes">
          <AnimatedNumber value={candidate.votes} />
          <small>votos</small>
        </div>
      )}
    </div>
  );
}
function TopCandidatesScene({
  candidates,
  state,
}: {
  candidates: CandidateResult[];
  state: BroadcastState;
}) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    if (!root.current) return;
    const next = new Map<string, number>();
    for (const el of root.current.querySelectorAll<HTMLElement>(
      "[data-candidate]",
    )) {
      const id = el.dataset.candidate!;
      const top = el.offsetTop;
      next.set(id, top);
      const old = previous.current.get(id);
      if (
        old !== undefined &&
        old !== top &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        el.animate(
          [
            { transform: `translateY(${old - top}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 420, easing: "cubic-bezier(.2,.7,.3,1)" },
        );
    }
    previous.current = next;
  }, [candidates]);
  return (
    <div ref={root} className="candidate-list">
      {candidates.map((candidate, index) => (
        <CandidateRow key={candidate.id} {...{ candidate, index, state }} />
      ))}
    </div>
  );
}
function CandidateScene({
  candidates,
  state,
}: {
  candidates: CandidateResult[];
  state: BroadcastState;
}) {
  const c = candidates[0];
  return c ? (
    <div className="individual">
      {state.showPhoto && <CandidatePhoto candidate={c} />}
      <div className="individual-info">
        <h2>{displayCandidateName(c, state.officeCode)}</h2>
        {state.showParty && (
          <p>
            {c.partyAcronym} | {c.number}
          </p>
        )}
        <div className="individual-values">
          <b>
            <AnimatedNumber value={c.percentage} percent />
          </b>
          {state.showVotes && (
            <span>
              <AnimatedNumber value={c.votes} /> votos
            </span>
          )}
        </div>
        <VoteBar percentage={c.percentage} />
        {state.showVice && (c.viceOrAlternates?.[0] || c.substitutes?.[0]) && (
          <p className="candidate-vice">
            {c.viceOrAlternates?.[0]
              ? `Vice: ${c.viceOrAlternates[0].nmu} (${c.viceOrAlternates[0].sgp})`
              : `Suplente: ${c.substitutes[0].nmu} (${c.substitutes[0].sgp})`}
          </p>
        )}
        {c.officialStatus && <p>{c.officialStatus}</p>}
        {c.destination && c.destination !== "Válido" && <p>{c.destination}</p>}
      </div>
    </div>
  ) : (
    <WaitingScene text="SELECIONE UM CANDIDATO NO STUDIO" />
  );
}
function CompareScene({
  candidates,
  state,
}: {
  candidates: CandidateResult[];
  state: BroadcastState;
}) {
  return (
    <div
      className="comparison"
      style={{ gridTemplateColumns: `repeat(${candidates.length},1fr)` }}
    >
      {candidates.map((c, i) => (
        <div key={c.id} className="compare-candidate">
          {state.showPhoto && <CandidatePhoto candidate={c} />}
          <h2>{displayCandidateName(c, state.officeCode)}</h2>
          {state.showParty && (
            <p>
              {c.partyAcronym} • {c.number}
            </p>
          )}
          <b className="percentage">
            <AnimatedNumber value={c.percentage} percent />
          </b>
          {state.showVotes && (
            <p>
              <AnimatedNumber value={c.votes} /> votos
            </p>
          )}
          <VoteBar percentage={c.percentage} index={i} />
          {c.officialStatus && <p>{c.officialStatus}</p>}
          {c.destination && c.destination !== "Válido" && (
            <p>{c.destination}</p>
          )}
        </div>
      ))}
    </div>
  );
}
function StatsScene({ result }: { result: ElectionResult }) {
  const s = result.stats;
  if (!s) {
    return (
      <div className="progress-scene">
        <span>APURAÇÃO DOS VOTOS</span>
        <b>
          <AnimatedNumber value={result.percentageSectionsTotalized} percent />
        </b>
        <p>
          {formatVotes(result.sectionsTotalized)} /{" "}
          {formatVotes(result.sectionsTotal)} SEÇÕES TOTALIZADAS
        </p>
      </div>
    );
  }
  return (
    <div className="stats-scene">
      <div className="stats-cards">
        <div className="stat-card stat-sections">
          <span className="stat-label">SEÇÕES TOTALIZADAS</span>
          <b className="stat-percent">
            <AnimatedNumber
              value={result.percentageSectionsTotalized}
              percent
            />
          </b>
          <div className="stat-sub">
            {formatVotes(result.sectionsTotalized)} /{" "}
            {formatVotes(result.sectionsTotal)}
          </div>
          <VoteBar percentage={result.percentageSectionsTotalized} index={1} />
        </div>
        <div className="stat-card stat-valid">
          <span className="stat-label">VOTOS VÁLIDOS</span>
          <b className="stat-percent">
            <AnimatedNumber value={s.validPercent} percent />
          </b>
          <div className="stat-sub">
            <AnimatedNumber value={s.validVotes} /> votos
          </div>
          <VoteBar percentage={s.validPercent} index={0} />
        </div>
        <div className="stat-card stat-blank">
          <span className="stat-label">BRANCOS</span>
          <b className="stat-percent">
            <AnimatedNumber value={s.blankPercent} percent />
          </b>
          <div className="stat-sub">
            <AnimatedNumber value={s.blankVotes} /> votos
          </div>
          <VoteBar percentage={s.blankPercent} index={2} />
        </div>
        <div className="stat-card stat-null">
          <span className="stat-label">NULOS</span>
          <b className="stat-percent">
            <AnimatedNumber value={s.nullPercent} percent />
          </b>
          <div className="stat-sub">
            <AnimatedNumber value={s.nullVotes} /> votos
          </div>
          <VoteBar percentage={s.nullPercent} index={3} />
        </div>
      </div>
      <div className="stats-footer-strip">
        <div className="stats-strip-item">
          <small>ELEITORADO TOTAL</small>
          <strong>{formatVotes(s.electorateTotal)}</strong>
        </div>
        <div className="stats-strip-item">
          <small>COMPARECIMENTO</small>
          <strong>
            <AnimatedNumber value={s.turnoutPercent} percent />
          </strong>
          <span>({formatVotes(s.turnout)})</span>
        </div>
        <div className="stats-strip-item">
          <small>ABSTENÇÃO</small>
          <strong>
            <AnimatedNumber value={s.abstentionPercent} percent />
          </strong>
          <span>({formatVotes(s.abstention)})</span>
        </div>
        <div className="stats-strip-item">
          <small>TOTAL APURADO</small>
          <strong>{formatVotes(s.totalVotes)}</strong>
        </div>
        <div className="stats-strip-item">
          <small>SEÇÕES PENDENTES</small>
          <strong>{formatVotes(result.sectionsPending)}</strong>
        </div>
      </div>
    </div>
  );
}
function VictoryGlowOverlay() {
  return (
    <div className="victory-glow-overlay" aria-hidden="true">
      <div className="victory-shimmer-sweep" />
    </div>
  );
}
function RunoffScene({
  result,
  state,
  round,
}: {
  result: ElectionResult;
  state: BroadcastState;
  round: "1" | "2";
}) {
  const sorted = result ? sortCandidates(result.candidates) : [];
  const c1 = state.selectedCandidateIds[0]
    ? sorted.find((c) => c.id === state.selectedCandidateIds[0]) || sorted[0]
    : sorted[0];
  const c2 = state.selectedCandidateIds[1]
    ? sorted.find((c) => c.id === state.selectedCandidateIds[1]) || sorted[1]
    : sorted[1];

  const proj = calculateRunoffProjection(result, round);
  const totalBothVotes = (c1?.votes || 0) + (c2?.votes || 0) || 1;
  const p1 = c1 ? (c1.votes / totalBothVotes) * 100 : 50;
  const p2 = c2 ? (c2.votes / totalBothVotes) * 100 : 50;
  const isC1Winner = proj.isMathematicallyElected && proj.leader?.id === c1?.id;
  const isC2Winner = proj.isMathematicallyElected && proj.leader?.id === c2?.id;

  if (!c1 || !c2) {
    return <WaitingScene text="AGUARDANDO CANDIDATOS" />;
  }

  const candClass1 =
    c1?.number === "22"
      ? "cand-22-blue"
      : c1?.number === "13"
        ? "cand-13-red"
        : "";
  const candClass2 =
    c2?.number === "22"
      ? "cand-22-blue"
      : c2?.number === "13"
        ? "cand-13-red"
        : "";

  return (
    <div className="runoff-scene">
      {state.showEffects && (isC1Winner || isC2Winner) && (
        <VictoryGlowOverlay />
      )}
      <div className="runoff-duel">
        {/* Candidate 1 */}
        <div
          className={`runoff-candidate candidate-left ${candClass1} ${isC1Winner ? "is-winner-card" : ""}`}
        >
          {state.showPhoto && (
            <div className="runoff-photo-wrap">
              <CandidatePhoto candidate={c1} />
              {isC1Winner && <span className="winner-stamp">ELEITO</span>}
            </div>
          )}
          <div className="runoff-info">
            <span
              className={`runoff-party-badge ${c1.number === "22" ? "badge-blue" : c1.number === "13" ? "badge-red" : ""}`}
            >
              {c1.partyAcronym} • {c1.number}
            </span>
            <h2 className="runoff-name">
              {displayCandidateName(c1, state.officeCode)}
            </h2>
            {state.showVice &&
              (c1.viceOrAlternates?.[0] || c1.substitutes?.[0]) && (
                <small className="runoff-vice">
                  Vice: {(c1.viceOrAlternates?.[0] || c1.substitutes?.[0])?.nmu}
                </small>
              )}
            <div className="runoff-score">
              <b className="runoff-percent">
                <AnimatedNumber value={c1.percentage} percent />
              </b>
              {state.showVotes && (
                <span className="runoff-votes">
                  <AnimatedNumber value={c1.votes} /> votos
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center Versus Column */}
        <div className="runoff-center">
          <div className="versus-badge">
            <span>VS</span>
          </div>
          <div className="runoff-balance-meter">
            <div className="balance-track">
              <div
                className={`balance-fill-left ${c1.number === "22" ? "fill-blue" : c1.number === "13" ? "fill-red" : ""}`}
                style={{ width: `${clampPercent(p1)}%` }}
              />
              <div
                className={`balance-fill-right ${c2.number === "22" ? "fill-blue" : c2.number === "13" ? "fill-red" : ""}`}
                style={{ width: `${clampPercent(p2)}%` }}
              />
              <div
                className="balance-pin"
                style={{ left: `${clampPercent(p1)}%` }}
              />
            </div>
            <div className="balance-labels">
              <span>{formatPercent(p1)}</span>
              <small>DISTRIBUIÇÃO DIRETA</small>
              <span>{formatPercent(p2)}</span>
            </div>
          </div>

          <div className="runoff-margin-pill">
            <small>DIFERENÇA</small>
            <strong>
              +{formatVotes(proj.marginVotes)} votos (
              {formatPercent(proj.marginPercent)})
            </strong>
          </div>

          {proj.isMathematicallyElected ? (
            <div className="math-elected-alert">
              <i className="star-icon">★</i>
              <span>{proj.statusLabel}</span>
              <i className="star-icon">★</i>
            </div>
          ) : proj.votesToSealVictory > 0 ? (
            <div className="math-countdown-alert">
              <span>
                Faltam <b>{formatVotes(proj.votesToSealVictory)}</b> votos p/
                garantia matemática
              </span>
            </div>
          ) : null}
        </div>

        {/* Candidate 2 */}
        <div
          className={`runoff-candidate candidate-right ${candClass2} ${isC2Winner ? "is-winner-card" : ""}`}
        >
          {state.showPhoto && (
            <div className="runoff-photo-wrap">
              <CandidatePhoto candidate={c2} />
              {isC2Winner && <span className="winner-stamp">ELEITO</span>}
            </div>
          )}
          <div className="runoff-info">
            <span
              className={`runoff-party-badge ${c2.number === "22" ? "badge-blue" : c2.number === "13" ? "badge-red" : ""}`}
            >
              {c2.partyAcronym} • {c2.number}
            </span>
            <h2 className="runoff-name">
              {displayCandidateName(c2, state.officeCode)}
            </h2>
            {state.showVice &&
              (c2.viceOrAlternates?.[0] || c2.substitutes?.[0]) && (
                <small className="runoff-vice">
                  Vice: {(c2.viceOrAlternates?.[0] || c2.substitutes?.[0])?.nmu}
                </small>
              )}
            <div className="runoff-score">
              <b className="runoff-percent">
                <AnimatedNumber value={c2.percentage} percent />
              </b>
              {state.showVotes && (
                <span className="runoff-votes">
                  <AnimatedNumber value={c2.votes} /> votos
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
const BRAZIL_MAP_VIEW: [number, number, number, number] = [8, 18, 872, 850];
const MAP_LABEL_MIN_SIZE = 20;
const MAP_LABEL_OVERRIDES: Record<string, { x: number; y: number }> = {
  RN: { x: 862, y: 292 },
  PB: { x: 862, y: 323 },
  PE: { x: 861, y: 355 },
  AL: { x: 856, y: 389 },
  SE: { x: 838, y: 421 },
  ES: { x: 721, y: 561 },
  RJ: { x: 677, y: 612 },
  SC: { x: 510, y: 730 },
  PR: { x: 515, y: 668 },
  DF: { x: 594, y: 503 },
};

function BrazilMapModule({
  result,
  state,
  dataMode,
  map,
}: {
  result: ElectionResult | null;
  state: BroadcastState;
  dataMode: Output["dataMode"];
  map: Output["map"];
}) {
  const [selectedUf, setSelectedUf] = useState<string | null>(() =>
    state.focusedUf && BRAZIL_STATES_GEO[state.focusedUf]
      ? state.focusedUf
      : null,
  );

  useEffect(() => {
    setSelectedUf(
      state.focusedUf && BRAZIL_STATES_GEO[state.focusedUf]
        ? state.focusedUf
        : null,
    );
  }, [state.focusedUf]);

  // Tecla Escape para desativar zoom
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedUf(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const mapSummary = calculateBrazilMapResults(
    result,
    dataMode === "tse" ? (map ?? { states: {}, updatedAt: null }) : map,
  );
  const candidate13 = result?.candidates.find((c) => c.number === "13");
  const candidate22 = result?.candidates.find((c) => c.number === "22");
  const name13 = displayCandidateName(candidate13, state.officeCode) || "LULA";
  const name22 =
    displayCandidateName(candidate22, state.officeCode) || "FLÁVIO BOLSONARO";

  const activeGeo = selectedUf ? BRAZIL_STATES_GEO[selectedUf] : null;
  const activeState = selectedUf ? mapSummary.stateResults[selectedUf] : null;

  const targetBox = useMemo<[number, number, number, number]>(() => {
    if (!activeGeo) return BRAZIL_MAP_VIEW;
    const [x1, y1, x2, y2] = activeGeo.bbox;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const span = Math.max(x2 - x1, y2 - y1, 120) * 1.12 + 46;
    return [
      Math.round(cx - span / 2),
      Math.round(cy - span / 2),
      Math.round(span),
      Math.round(span),
    ];
  }, [activeGeo]);

  const [animBox, setAnimBox] =
    useState<[number, number, number, number]>(BRAZIL_MAP_VIEW);
  const boxRef = useRef<[number, number, number, number]>(BRAZIL_MAP_VIEW);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = [...boxRef.current] as [number, number, number, number];
    const target = targetBox;
    const startTime = performance.now();
    const duration = 520;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      const next: [number, number, number, number] = [
        start[0] + (target[0] - start[0]) * ease,
        start[1] + (target[1] - start[1]) * ease,
        start[2] + (target[2] - start[2]) * ease,
        start[3] + (target[3] - start[3]) * ease,
      ];
      boxRef.current = next;
      setAnimBox(next);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetBox]);

  const viewBoxStr = `${Math.round(animBox[0])} ${Math.round(animBox[1])} ${Math.round(animBox[2])} ${Math.round(animBox[3])}`;

  return (
    <div className={`br-map-container ${selectedUf ? "is-focused" : ""}`}>
      <div className="br-map-stage">
        <div className="br-svg-wrap">
          <div className="map-readout">
            <span className="map-readout-label">APURAÇÃO</span>
            <strong className="map-readout-value">
              <AnimatedNumber
                value={result ? result.percentageSectionsTotalized : 0}
                percent
              />
            </strong>
            <span className="map-readout-caption">DAS SEÇÕES</span>
            {dataMode === "tse" ? (
              <span className="map-official-badge">TSE OFICIAL</span>
            ) : (
              <span className="map-simulation-badge">SIMULAÇÃO</span>
            )}
          </div>

          {!selectedUf && (
            <aside className="map-legend" aria-label="Estados por candidato">
              <div className="map-legend-row legend-red">
                <span className="map-legend-name">{name13}</span>
                <div className="map-legend-tally">
                  <span className="map-legend-number">13</span>
                  <b className="map-legend-count">{mapSummary.statesWon13}</b>
                  <small>ESTADOS</small>
                </div>
              </div>
              <div className="map-legend-row legend-blue">
                <span className="map-legend-name">{name22}</span>
                <div className="map-legend-tally">
                  <span className="map-legend-number">22</span>
                  <b className="map-legend-count">{mapSummary.statesWon22}</b>
                  <small>ESTADOS</small>
                </div>
              </div>
            </aside>
          )}

          <svg
            className="br-svg-canvas"
            viewBox={viewBoxStr}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Fundo clicável para voltar ao Brasil */}
            <rect
              x="-300"
              y="-300"
              width="1600"
              height="1600"
              fill="transparent"
              style={{ cursor: selectedUf ? "zoom-out" : "default" }}
              onClick={() => setSelectedUf(null)}
            />

            {/* Camada dos 27 Estados da Federação */}
            <g className="map-states-layer">
              {Object.entries(BRAZIL_STATES_GEO).map(([sigla, geo]) => {
                const sRes = mapSummary.stateResults[sigla];
                const isSelected = selectedUf === sigla;
                const leader = sRes?.leader ?? "tie";

                const fill =
                  leader === "22"
                    ? "#0a63c9"
                    : leader === "13"
                      ? "#cf1f3d"
                      : "#243548";

                return (
                  <path
                    key={sigla}
                    id={`state-${sigla}`}
                    className={`br-state-path ${leader === "22" ? "state-22" : leader === "13" ? "state-13" : ""} ${isSelected ? "is-selected" : ""}`}
                    d={geo.d}
                    fill={fill}
                    stroke={isSelected ? "#ffffff" : "#06101d"}
                    strokeWidth={isSelected ? 3.5 : 1.6}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      opacity: selectedUf && !isSelected ? 0.3 : 1,
                      transition: "opacity 0.28s ease",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUf(selectedUf === sigla ? null : sigla);
                    }}
                  />
                );
              })}
              {selectedUf === "GO" && (
                <path
                  d={BRAZIL_STATES_GEO.DF.d}
                  fill="none"
                  stroke="#06101d"
                  strokeWidth={5.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
            </g>

            {/* Siglas das UFs (sem percentuais e sem caixas) */}
            <g
              className="map-labels-layer"
              pointerEvents="none"
              style={{
                opacity: selectedUf ? 0 : 1,
                transition: "opacity 0.2s ease",
              }}
            >
              {Object.entries(BRAZIL_STATES_GEO).map(([sigla, geo]) => {
                const [x1, y1, x2, y2] = geo.bbox;
                const position = MAP_LABEL_OVERRIDES[sigla] ?? {
                  x: geo.cx,
                  y: geo.cy,
                };
                const size =
                  x2 - x1 < 42 || y2 - y1 < 30
                    ? MAP_LABEL_MIN_SIZE
                    : MAP_LABEL_MIN_SIZE + 4;

                return (
                  <text
                    key={`lbl-${sigla}`}
                    className="state-label-group"
                    x={position.x}
                    y={position.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize={size}
                    fontWeight="900"
                    letterSpacing="0.4"
                    stroke="#04101d"
                    strokeWidth="3"
                    paintOrder="stroke fill"
                  >
                    {sigla}
                  </text>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Dock Flutuante do Estado no Rodapé do Mapa (Aparece suavemente sem espremer o mapa!) */}
        {activeState && (
          <aside className="br-floating-dock inspect-state-detail">
            <div className="dock-left-header">
              <div className="dock-sigla-box">
                <span>{activeState.sigla}</span>
              </div>
              <div className="dock-info-block">
                <div className="dock-title-block">
                  <h2>{activeState.name}</h2>
                  <small>
                    Região {activeState.region} • Capital: {activeState.capital}
                  </small>
                </div>
                <div
                  className={`inspect-winner-banner ${activeState.leader === "22" ? "win-22" : activeState.leader === "13" ? "win-13" : "win-tie"}`}
                >
                  <span className="status-label">
                    {activeState.leader === "22"
                      ? `★ ${name22} ${activeState.final ? "VENCEU" : "LIDERA"} ★`
                      : activeState.leader === "13"
                        ? `★ ${name13} ${activeState.final ? "VENCEU" : "LIDERA"} ★`
                        : "AGUARDANDO APURAÇÃO"}
                  </span>
                  {activeState.leader !== "tie" && (
                    <b className="status-diff">
                      +{formatVotes(activeState.marginVotes)} (
                      {activeState.marginPercent}%)
                    </b>
                  )}
                </div>
              </div>
            </div>

            <div className="dock-center-duel">
              <div className="cand-duel-line cand-22">
                <div className="duel-top-info">
                  <strong>{name22}</strong>
                  <b>{formatPercent(activeState.percent22)}</b>
                </div>
                <div className="duel-track">
                  <div
                    className="duel-fill duel-fill-blue"
                    style={{ width: `${clampPercent(activeState.percent22)}%` }}
                  />
                </div>
                <small>
                  22 • PL • {formatVotes(activeState.votes22)} votos
                </small>
              </div>
              <div className="cand-duel-line cand-13">
                <div className="duel-top-info">
                  <strong>{name13}</strong>
                  <b>{formatPercent(activeState.percent13)}</b>
                </div>
                <div className="duel-track">
                  <div
                    className="duel-fill duel-fill-red"
                    style={{ width: `${clampPercent(activeState.percent13)}%` }}
                  />
                </div>
                <small>
                  13 • PT • {formatVotes(activeState.votes13)} votos
                </small>
              </div>
            </div>

            {activeState.official ? (
              <div className="dock-right-cities dock-official-source">
                <div className="dock-cities-title">
                  <span>TSE • DADOS OFICIAIS</span>
                  <small>
                    Seções: {formatPercent(activeState.sectionsPercent)}
                  </small>
                </div>
                <p>
                  {activeState.validVotes
                    ? `${formatVotes(activeState.validVotes)} votos válidos no estado.`
                    : "Aguardando o TSE publicar os votos deste estado."}
                </p>
                <p>
                  O detalhamento municipal não é divulgado nesta fonte oficial.
                </p>
              </div>
            ) : (
              <div className="dock-right-cities">
                <div className="dock-cities-title">
                  <span>CIDADES DO ESTADO • APURAÇÃO</span>
                  <small>
                    Seções: {formatPercent(activeState.sectionsPercent)}
                  </small>
                </div>
                <div className="dock-cities-row">
                  {activeState.cities.map((city) => (
                    <div key={city.name} className="city-row-card">
                      <div className="city-row-header">
                        <strong>{city.shortName ?? city.name}</strong>
                        <span
                          className={`city-leader-tag ${city.leader === "22" ? "tag-blue" : "tag-red"}`}
                        >
                          {city.leader === "22" ? "22" : "13"}
                        </span>
                      </div>
                      <div className="city-dual-track">
                        <div
                          className="city-fill-22"
                          style={{ width: `${city.percent22}%` }}
                        />
                        <div
                          className="city-fill-13"
                          style={{ width: `${city.percent13}%` }}
                        />
                      </div>
                      <div className="city-row-footer">
                        <span className="text-blue">
                          <b>{formatPercent(city.percent22)}</b>
                        </span>
                        <span className="text-red">
                          <b>{formatPercent(city.percent13)}</b>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn-dock-close"
              title="Voltar ao mapa do Brasil (Reset Zoom)"
              onClick={() => setSelectedUf(null)}
            >
              ✕
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}

function FullscreenScene({ output }: { output: Output }) {
  const { state, result, settings, dataMode, map, round = "2" } = output;
  const mapAvailable =
    state.scope === "br" &&
    state.officeCode === "0001" &&
    (dataMode !== "tse" || round === "2");
  const activeTab =
    mapAvailable && state.fullscreenTab !== "duel" ? "map" : "duel";

  const sorted = result ? sortCandidates(result.candidates) : [];
  const c1 = sorted[0];
  const c2 = sorted[1];
  const proj = calculateRunoffProjection(result, round);
  const s = result?.stats;
  const isC1Winner = proj.isMathematicallyElected && proj.leader?.id === c1?.id;
  const isC2Winner = proj.isMathematicallyElected && proj.leader?.id === c2?.id;

  const scope =
    result?.scopeName ??
    (state.scope === "br"
      ? "Brasil"
      : state.scope === "state"
        ? output.ufName || output.uf || "Estado"
        : output.ufName
          ? `${output.ufName} • ${output.uf}`
          : "Município");

  if (activeTab === "map") {
    return (
      <div className="fullscreen-arena map-arena">
        <BrazilMapModule
          result={result}
          state={state}
          dataMode={dataMode}
          map={map}
        />
      </div>
    );
  }

  if (!c1 || !c2) return <WaitingScene text="AGUARDANDO CANDIDATOS" />;

  return (
    <div className="fullscreen-arena">
      {state.showEffects && (isC1Winner || isC2Winner) && (
        <VictoryGlowOverlay />
      )}
      <div className="fullscreen-backdrop-fx" />

      {/* Top Bar */}
      <header className="fullscreen-header">
        <div className="fs-brand">
          <span className="fs-live-badge">
            <i className="pulse-dot" /> AO VIVO
          </span>
          <div className="fs-title-text">
            <h1>
              ELEIÇÕES 2026 <b>{round === "2" ? "2º TURNO" : "1º TURNO"}</b>
            </h1>
            <span>
              {scope} • {offices[state.officeCode]}
            </span>
          </div>
        </div>

        {settings.stationLogo && (
          <img
            className="fs-station-logo"
            src={settings.stationLogo}
            alt={settings.stationName}
          />
        )}

        <div className="fs-progress-pill">
          <div className="fs-progress-info">
            <small>SEÇÕES TOTALIZADAS</small>
            <strong>
              <AnimatedNumber
                value={result ? result.percentageSectionsTotalized : 0}
                percent
              />
            </strong>
            <span>
              {formatVotes(result?.sectionsTotalized ?? 0)} de{" "}
              {formatVotes(result?.sectionsTotal ?? 0)}
            </span>
          </div>
        </div>
      </header>

      <main className="fullscreen-stage fs-stage-duel">
        {c1 && (
          <div
            className={`fs-candidate fs-candidate-1 ${isC1Winner ? "fs-winner" : ""}`}
          >
            <div className="fs-photo-container">
              <CandidatePhoto candidate={c1} />
              {isC1Winner && <div className="fs-winner-banner">ELEITO</div>}
            </div>
            <div className="fs-details">
              <div className="fs-party-pill">
                {c1.partyAcronym} • Nº {c1.number}
              </div>
              <h2 className="fs-name">
                {displayCandidateName(c1, state.officeCode)}
              </h2>
              {state.showVice &&
                (c1.viceOrAlternates?.[0] || c1.substitutes?.[0]) && (
                  <div className="fs-vice-line">
                    Vice:{" "}
                    {(c1.viceOrAlternates?.[0] || c1.substitutes?.[0])?.nmu}
                  </div>
                )}
              <div className="fs-big-percentage">
                <AnimatedNumber value={c1.percentage} percent />
              </div>
              <div className="fs-vote-bar-wrap">
                <VoteBar percentage={c1.percentage} index={0} />
              </div>
              <div className="fs-votes-count">
                <strong>
                  <AnimatedNumber value={c1.votes} />
                </strong>{" "}
                votos
              </div>
            </div>
          </div>
        )}

        {/* Center Showdown Hub */}
        <div className="fs-center-hub">
          <div className="fs-vs-symbol">VS</div>
          <div className="fs-difference-card">
            <small>DIFERENÇA PROVISÓRIA</small>
            <b>+{formatVotes(proj.marginVotes)}</b>
            <span>({formatPercent(proj.marginPercent)})</span>
          </div>

          {proj.isMathematicallyElected ? (
            <div className="fs-math-badge fs-math-definite">
              <span>★ {proj.statusLabel} ★</span>
            </div>
          ) : proj.votesToSealVictory > 0 ? (
            <div className="fs-math-badge fs-math-pending">
              <small>GARANTIA MATEMÁTICA</small>
              <span>Faltam {formatVotes(proj.votesToSealVictory)} votos</span>
            </div>
          ) : null}

          {result && (
            <div className="fs-speed-strip">
              <span>
                Seções restantes: <b>{formatVotes(result.sectionsPending)}</b>
              </span>
            </div>
          )}
        </div>

        {c2 && (
          <div
            className={`fs-candidate fs-candidate-2 ${isC2Winner ? "fs-winner" : ""}`}
          >
            <div className="fs-photo-container">
              <CandidatePhoto candidate={c2} />
              {isC2Winner && <div className="fs-winner-banner">ELEITO</div>}
            </div>
            <div className="fs-details">
              <div className="fs-party-pill">
                {c2.partyAcronym} • Nº {c2.number}
              </div>
              <h2 className="fs-name">
                {displayCandidateName(c2, state.officeCode)}
              </h2>
              {state.showVice &&
                (c2.viceOrAlternates?.[0] || c2.substitutes?.[0]) && (
                  <div className="fs-vice-line">
                    Vice:{" "}
                    {(c2.viceOrAlternates?.[0] || c2.substitutes?.[0])?.nmu}
                  </div>
                )}
              <div className="fs-big-percentage">
                <AnimatedNumber value={c2.percentage} percent />
              </div>
              <div className="fs-vote-bar-wrap">
                <VoteBar percentage={c2.percentage} index={2} />
              </div>
              <div className="fs-votes-count">
                <strong>
                  <AnimatedNumber value={c2.votes} />
                </strong>{" "}
                votos
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Complete Stats Deck */}
      <footer className="fullscreen-footer">
        <div className="fs-stat-deck">
          <div className="fs-deck-card">
            <small>SEÇÕES APURADAS</small>
            <strong>
              {result ? formatPercent(result.percentageSectionsTotalized) : "—"}
            </strong>
            <span>
              {result
                ? `${formatVotes(result.sectionsTotalized)} / ${formatVotes(result.sectionsTotal)}`
                : ""}
            </span>
          </div>
          <div className="fs-deck-card">
            <small>COMPARECIMENTO</small>
            <strong>{s ? formatPercent(s.turnoutPercent) : "—"}</strong>
            <span>{s ? `${formatVotes(s.turnout)} eleitores` : ""}</span>
          </div>
          <div className="fs-deck-card">
            <small>ABSTENÇÃO</small>
            <strong>{s ? formatPercent(s.abstentionPercent) : "—"}</strong>
            <span>{s ? `${formatVotes(s.abstention)} eleitores` : ""}</span>
          </div>
          <div className="fs-deck-card">
            <small>VOTOS VÁLIDOS</small>
            <strong>{s ? formatPercent(s.validPercent) : "—"}</strong>
            <span>{s ? `${formatVotes(s.validVotes)} votos` : ""}</span>
          </div>
          <div className="fs-deck-card">
            <small>BRANCOS</small>
            <strong>{s ? formatPercent(s.blankPercent) : "—"}</strong>
            <span>{s ? `${formatVotes(s.blankVotes)} votos` : ""}</span>
          </div>
          <div className="fs-deck-card">
            <small>NULOS</small>
            <strong>{s ? formatPercent(s.nullPercent) : "—"}</strong>
            <span>{s ? `${formatVotes(s.nullVotes)} votos` : ""}</span>
          </div>
        </div>

        <div className="fs-meta-strip">
          <span>
            {dataMode === "tse"
              ? "FONTE OFICIAL: TRIBUNAL SUPERIOR ELEITORAL"
              : "SIMULADOR ELEITORAL"}
            {settings.stationName ? ` • ${settings.stationName}` : ""}
          </span>
          <span>
            {result?.progressStatus === "p"
              ? "APURAÇÃO EM ANDAMENTO"
              : result?.final
                ? "TOTALIZAÇÃO FINAL CONCLUÍDA"
                : ""}
          </span>
          <span>
            Atualizado{" "}
            {formatTime(
              result?.totalizationAt ??
                result?.generatedAt ??
                new Date().toISOString(),
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}
function ProjectionScene({
  result,
  state,
  round,
}: {
  result: ElectionResult;
  state: BroadcastState;
  round: "1" | "2";
}) {
  const isLegislative =
    state.officeCode === "0006" ||
    state.officeCode === "0007" ||
    state.officeCode === "0008";

  if (isLegislative) {
    const seatsProj = calculateSeatsProjection(
      result,
      state.officeCode === "0006" ? 53 : state.officeCode === "0008" ? 24 : 77,
    );
    return (
      <div className="projection-scene">
        <div className="proj-header-banner">
          <div className="proj-title">
            <h2>PROJEÇÃO MATEMÁTICA DE CADEIRAS (SISTEMA PROPORCIONAL)</h2>
            <p>
              Cálculo baseado no Quociente Eleitoral (QE), Quociente Partidário
              (QP) e Sobras de Maiores Médias (D'Hondt / TSE).
            </p>
          </div>
          <div className="proj-quotient-badge">
            <small>QUOCIENTE ELEITORAL (QE)</small>
            <strong>{formatVotes(seatsProj.electoralQuotient)}</strong>
            <span>VOTOS P/ CADEIRA</span>
          </div>
        </div>

        <div className="proj-parties-grid">
          {seatsProj.parties.slice(0, 6).map((p) => (
            <div key={p.partyAcronym} className="proj-party-card">
              <div className="proj-party-header">
                <strong>{p.partyAcronym}</strong>
                <span className="proj-seats-count">
                  <b>{p.totalSeats}</b>{" "}
                  {p.totalSeats === 1 ? "cadeira" : "cadeiras"}
                </span>
              </div>
              <div className="proj-party-metrics">
                <span>
                  Votos: {formatVotes(p.totalVotes)} (
                  {formatPercent(p.percentage)})
                </span>
                <span>
                  QP direto: {p.initialSeats} | Sobras: +{p.leftoverSeats}
                </span>
              </div>
              <div className="proj-cands-list">
                <small>Eleitos projetados:</small>
                {p.electedCandidates.length > 0 ? (
                  p.electedCandidates.map((c) => (
                    <div key={c.id} className="proj-cand-pill">
                      <span>{displayCandidateName(c, state.officeCode)}</span>
                      <b>{formatVotes(c.votes)}</b>
                    </div>
                  ))
                ) : (
                  <span className="proj-no-cands">
                    Sem cadeiras preenchidas
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Majoritário / 2º Turno
  const proj = calculateRunoffProjection(result, round);
  const remainingSections = result.sectionsTotal - result.sectionsTotalized;
  const remainingSecPercent =
    result.sectionsTotal > 0
      ? (remainingSections / result.sectionsTotal) * 100
      : 0;

  let runnerUpNeededPercent = 0;
  if (proj.estimatedRemainingVotes > 0 && proj.marginVotes > 0) {
    const votesNeededToTie = Math.ceil(
      (proj.estimatedRemainingVotes + proj.marginVotes) / 2,
    );
    runnerUpNeededPercent = Math.min(
      100,
      (votesNeededToTie / proj.estimatedRemainingVotes) * 100,
    );
  }

  return (
    <div className="projection-scene">
      {state.showEffects && proj.isMathematicallyElected && (
        <VictoryGlowOverlay />
      )}
      <div className="proj-header-banner">
        <div className="proj-title">
          <h2>
            PROJEÇÃO MATEMÁTICA ELEITORAL •{" "}
            {round === "2" ? "2º TURNO" : "1º TURNO"}
          </h2>
          <p>Análise de reversibilidade e limiar de confirmação matemática.</p>
        </div>
        <div
          className={`proj-status-flag ${proj.isMathematicallyElected ? "flag-elected" : "flag-pending"}`}
        >
          {proj.isMathematicallyElected
            ? "★ ELEIÇÃO DEFINIDA"
            : "APURAÇÃO EM ABERTO"}
        </div>
      </div>

      <div className="proj-metrics-quad">
        <div className="proj-card">
          <span className="proj-card-label">LÍDER DA DISPUTA</span>
          <b className="proj-card-value">
            {proj.leader
              ? displayCandidateName(proj.leader, state.officeCode)
              : "—"}
          </b>
          <div className="proj-card-sub">
            {formatVotes(proj.leader?.votes ?? 0)} votos (
            {formatPercent(proj.leader?.percentage ?? 0)})
          </div>
        </div>

        <div className="proj-card">
          <span className="proj-card-label">VANTAGEM ATUAL</span>
          <b className="proj-card-value text-accent">
            +{formatVotes(proj.marginVotes)}
          </b>
          <div className="proj-card-sub">
            Diferença de {formatPercent(proj.marginPercent)} dos válidos
          </div>
        </div>

        <div className="proj-card">
          <span className="proj-card-label">VOTOS RESTANTES (ESTIMATIVA)</span>
          <b className="proj-card-value">
            {formatVotes(proj.estimatedRemainingVotes)}
          </b>
          <div className="proj-card-sub">
            {formatVotes(remainingSections)} seções a apurar (
            {formatPercent(remainingSecPercent)})
          </div>
        </div>

        <div className="proj-card proj-card-highlight">
          <span className="proj-card-label">PROJEÇÃO DE VIRADA</span>
          {proj.isMathematicallyElected ? (
            <>
              <b className="proj-card-value text-gold">
                MATEMATICAMENTE ELEITO
              </b>
              <div className="proj-card-sub">
                Virada impossível com os votos restantes.
              </div>
            </>
          ) : (
            <>
              <b className="proj-card-value">
                {runnerUpNeededPercent > 0
                  ? `${formatPercent(runnerUpNeededPercent)} nec.`
                  : "DISPUTA ABERTA"}
              </b>
              <div className="proj-card-sub">
                Faltam {formatVotes(proj.votesToSealVictory)} votos p/ líder
                fechar matematicamente.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function WaitingScene({ text }: { text: string }) {
  return (
    <div className="waiting">
      <span className="waiting-mark" />
      <h2>{text}</h2>
    </div>
  );
}
function Scene({ output }: { output: Output }) {
  const { state, result, settings, dataMode } = output;
  if (state.scene === "fullscreen") {
    if (!result) return <WaitingScene text="AGUARDANDO DADOS OFICIAIS" />;
    return <FullscreenScene output={output} />;
  }
  const sorted = result ? sortCandidates(result.candidates) : [];
  const isRunoffContext = state.scene === "runoff";
  const candidates = isRunoffContext
    ? sorted.slice(0, 2)
    : state.scene === "top" || state.scene === "ticker"
      ? sorted.slice(0, state.topCount)
      : state.selectedCandidateIds
          .map((id) => sorted.find((c) => c.id === id))
          .filter((c): c is CandidateResult => !!c);
  const scope =
    result?.scopeName ??
    (state.scope === "br"
      ? "Brasil"
      : state.scope === "state"
        ? output.ufName || output.uf || "Estado"
        : output.ufName
          ? `${output.ufName} • ${output.uf}`
          : "Município");
  return (
    <section
      className={`broadcast-module scene-${state.scene}`}
      style={{ "--broadcast-blue": settings.primaryColor } as CSSProperties}
      data-scene={state.scene}
    >
      {dataMode !== "tse" && (
        <div className="simulation-output">
          {dataMode === "tse-sim"
            ? "SIMULAÇÃO • AMBIENTE DE TESTES DO TSE"
            : "SIMULAÇÃO • DADOS FICTÍCIOS"}
        </div>
      )}
      <header className="broadcast-header">
        <div className="election-brand">
          ELEIÇÕES <b>2026</b>
        </div>
        <div className="scope-title">
          <strong>{scope}</strong>
          <small>{offices[state.officeCode]}</small>
        </div>
        {result?.mathematicallyDefined === "s" && (
          <div className="math-defined-badge">DEFINIDO MATEMATICAMENTE</div>
        )}
        {settings.stationLogo && (
          <img
            className="station-logo"
            src={settings.stationLogo}
            alt={settings.stationName}
          />
        )}
        <div className="progress-badge">
          <span>APURAÇÃO</span>
          <b>
            {result ? (
              <AnimatedNumber
                value={result.percentageSectionsTotalized}
                percent
              />
            ) : (
              "—"
            )}
          </b>
          <small>DAS SEÇÕES</small>
        </div>
      </header>
      {!result ? (
        <WaitingScene text="AGUARDANDO DADOS OFICIAIS" />
      ) : !result.disclosureAllowed ? (
        <WaitingScene text="AGUARDANDO LIBERAÇÃO OFICIAL DA VOTAÇÃO" />
      ) : result.progressStatus === "n" ? (
        <WaitingScene text="AGUARDANDO INÍCIO DA TOTALIZAÇÃO" />
      ) : state.scene === "top" ? (
        <TopCandidatesScene {...{ candidates, state }} />
      ) : state.scene === "candidate" ? (
        <CandidateScene {...{ candidates, state }} />
      ) : state.scene === "compare" ? (
        <CompareScene {...{ candidates, state }} />
      ) : state.scene === "runoff" ? (
        <RunoffScene
          result={result}
          state={state}
          round={output.round ?? "2"}
        />
      ) : state.scene === "projection" ? (
        <ProjectionScene
          result={result}
          state={state}
          round={output.round ?? "2"}
        />
      ) : state.scene === "stats" ? (
        <StatsScene result={result} />
      ) : state.scene === "progress" ? (
        <div className="progress-scene">
          <span>APURAÇÃO DOS VOTOS</span>
          <b>
            <AnimatedNumber
              value={result.percentageSectionsTotalized}
              percent
            />
          </b>
          <p>
            {formatVotes(result.sectionsTotalized)} /{" "}
            {formatVotes(result.sectionsTotal)} SEÇÕES TOTALIZADAS
          </p>
          {state.showStats && result.stats && (
            <div className="progress-stats-summary">
              <span>
                Válidos: <b>{formatPercent(result.stats.validPercent)}</b>
              </span>
              <span>
                Brancos: <b>{formatPercent(result.stats.blankPercent)}</b>
              </span>
              <span>
                Nulos: <b>{formatPercent(result.stats.nullPercent)}</b>
              </span>
              <span>
                Abstenção:{" "}
                <b>{formatPercent(result.stats.abstentionPercent)}</b>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="ticker-window">
          <div className="ticker-content">
            {[0, 1].map((copy) => (
              <span key={copy} aria-hidden={copy === 1}>
                {candidates.map((c) => (
                  <span key={c.id}>
                    <strong>{displayCandidateName(c, state.officeCode)}</strong>{" "}
                    {formatPercent(c.percentage)} <i>•</i>{" "}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}
      <footer className="broadcast-footer">
        <span>
          {dataMode === "mock"
            ? "DADOS FICTÍCIOS PARA ENSAIO"
            : dataMode === "tse-sim"
              ? "DADOS: SIMULADO TSE"
              : "DADOS: TSE"}
          {settings.stationName ? ` • ${settings.stationName}` : ""}
        </span>
        <span>
          {result?.progressStatus === "p"
            ? "APURAÇÃO EM ANDAMENTO"
            : result?.final
              ? "TOTALIZAÇÃO FINAL"
              : ""}
        </span>
        {state.showTimestamp && (
          <span>
            {result
              ? `Atualizado ${formatTime(result.totalizationAt ?? result.generatedAt)}`
              : "Aguardando fonte"}
          </span>
        )}
      </footer>
    </section>
  );
}
export function BroadcastCanvas({
  output,
  preview = false,
}: {
  output: Output;
  preview?: boolean;
}) {
  const [display, setDisplay] = useState(output);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFullscreen =
    display.state.scene === "fullscreen" ||
    display.state.position === "fullscreen";
  const isFullWidthLowerThird =
    !isFullscreen &&
    display.state.position.startsWith("bottom") &&
    [
      "candidate",
      "compare",
      "runoff",
      "projection",
      "stats",
      "progress",
    ].includes(display.state.scene);
  const key = (o: Output) =>
    `${o.state.scene}:${o.state.scope}:${o.state.officeCode}:${o.state.municipalityCode ?? ""}:${o.state.zoneCode ?? ""}:${o.state.visible}:${o.state.position}`;
  useEffect(() => {
    if (key(output) !== key(display)) {
      setLeaving(true);
      timer.current = setTimeout(() => {
        setDisplay(output);
        setLeaving(false);
      }, 240);
    } else {
      setDisplay(output);
      setLeaving(false);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [output]);
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const handler = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener("resize", handler);
    return () => removeEventListener("resize", handler);
  }, []);
  const scale = Math.min(size.w / 1920, size.h / 1080);
  const state = display.state;
  return (
    <div
      className="canvas"
      style={{ width: 1920, height: 1080, transform: `scale(${scale})` }}
    >
      {preview && !isFullscreen && (
        <div
          className="safe-area"
          style={{
            top: state.safeArea,
            right: state.safeArea,
            bottom: state.safeArea,
            left: state.safeArea,
          }}
        />
      )}
      {state.visible && (
        <div
          className={`module-anchor ${state.position} ${isFullscreen ? "is-fullscreen" : ""} ${isFullWidthLowerThird ? "is-fullwidth-lower-third" : ""} ${leaving ? "scene-leave" : "scene-enter"}`}
          style={
            {
              "--module-scale":
                isFullscreen || isFullWidthLowerThird ? 1 : state.scale,
            } as CSSProperties
          }
        >
          <Scene output={display} />
        </div>
      )}
    </div>
  );
}
export function Overlay() {
  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const { output } = useOutput(preview);
  const forced = location.pathname.split("/").pop();
  if (!output) return null;
  const testScene = [
    "top",
    "candidate",
    "compare",
    "progress",
    "ticker",
    "stats",
    "runoff",
    "fullscreen",
    "projection",
  ].includes(forced ?? "")
    ? (forced as BroadcastState["scene"])
    : null;
  const rendered = testScene
    ? {
        ...output,
        state: {
          ...output.state,
          scene: testScene,
          visible: true,
          selectedCandidateIds:
            output.result?.candidates
              .slice(0, testScene === "candidate" ? 1 : 2)
              .map((c) => c.id) ?? [],
        },
      }
    : output;
  return <BroadcastCanvas output={rendered} preview={preview} />;
}
