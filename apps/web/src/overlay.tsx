import {
  useEffect,
  useLayoutEffect,
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
  type BroadcastState,
  type CandidateResult,
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
        <strong>{candidate.ballotName}</strong>
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
        <h2>{c.ballotName}</h2>
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
        {c.officialStatus && <p>{c.officialStatus}</p>}
        {c.destination !== "Válido" && <p>{c.destination}</p>}
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
          <h2>{c.ballotName}</h2>
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
        </div>
      ))}
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
  const sorted = result ? sortCandidates(result.candidates) : [];
  const candidates =
    state.scene === "top" || state.scene === "ticker"
      ? sorted.slice(0, state.topCount)
      : state.selectedCandidateIds
          .map((id) => sorted.find((c) => c.id === id))
          .filter((c): c is CandidateResult => !!c);
  const scope =
    result?.scopeName ??
    (state.scope === "br"
      ? "Brasil"
      : state.scope === "state"
        ? "Minas Gerais"
        : "Teófilo Otoni • MG");
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
        </div>
      ) : (
        <div className="ticker-window">
          <div className="ticker-content">
            {[0, 1].map((copy) => (
              <span key={copy} aria-hidden={copy === 1}>
                {candidates.map((c) => (
                  <span key={c.id}>
                    <strong>{c.ballotName}</strong>{" "}
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
  const key = (o: Output) =>
    `${o.state.scene}:${o.state.scope}:${o.state.officeCode}:${o.state.visible}`;
  useEffect(() => {
    if (key(output) !== key(display)) {
      setLeaving(true);
      timer.current = setTimeout(() => {
        setDisplay(output);
        setLeaving(false);
      }, 220);
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
      {preview && (
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
          className={`module-anchor ${state.position} ${leaving ? "scene-leave" : "scene-enter"}`}
          style={{ "--module-scale": state.scale } as CSSProperties}
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
