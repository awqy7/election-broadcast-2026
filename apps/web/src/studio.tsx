import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { api, useOutput } from "./connection";
import {
  formatPercent,
  formatTime,
  formatVotes,
  normalizeName,
  offices,
  type BroadcastState,
  type Output,
  type Settings,
} from "../../../packages/shared";
import { CandidatePhoto } from "./overlay";
type Health = {
  server: string;
  database: string;
  tse: string;
  dataMode: string;
  lastFetchAt: string | null;
  lastChangedAt: string | null;
  lastSnapshotAt: string | null;
  freshness: string;
  sseClients: number;
  overlayClients: number;
  error: string | null;
  metrics: { averageLatency: number };
  municipality: unknown;
  photos?: {
    total: number;
    cached: number;
    queued: number;
    failed: number;
    waiting: number;
    pausedUntil: number;
  };
};
type Diagnostic = {
  name: string;
  status: string;
  durationMs: number;
  detail: string;
};
const scenes = [
  ["top", "TOP 4"],
  ["candidate", "INDIVIDUAL"],
  ["compare", "COMPARAÇÃO"],
  ["progress", "APURAÇÃO"],
  ["ticker", "TICKER"],
] as const;
function Login({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState(""),
    [error, setError] = useState("");
  async function login(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/login", { key });
      setKey("");
      onLogin();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <main className="login-page">
      <div className="login-brand">
        ELECTION
        <br />
        <b>BROADCAST 2026</b>
      </div>
      <form onSubmit={login}>
        <h1>Acesso ao Studio</h1>
        <p>Controle local de gráficos eleitorais.</p>
        <label>
          Chave de acesso
          <input
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
          />
        </label>
        <button className="primary" type="submit">
          Entrar no Studio
        </button>
        {error && <p role="alert">{error}</p>}
        <small>A chave é definida pelo administrador na instalação.</small>
      </form>
    </main>
  );
}
export function Studio() {
  const [logged, setLogged] = useState<boolean | null>(null);
  useEffect(() => {
    api("/api/studio")
      .then(() => setLogged(true))
      .catch(() => setLogged(false));
  }, []);
  if (logged === null)
    return <main className="studio-loading">Conectando ao Studio…</main>;
  return logged ? (
    <StudioShell onLogout={() => setLogged(false)} />
  ) : (
    <Login onLogin={() => setLogged(true)} />
  );
}
function StudioShell({ onLogout }: { onLogout: () => void }) {
  const { output, connected } = useOutput(true);
  const [initial, setInitial] = useState<Output | null>(null);
  const current = initial ?? output;
  const commandQueue = useRef(Promise.resolve());
  const pendingCount = useRef(0);
  const [pending, setPending] = useState(false);
  const [program, setProgram] = useState<Output | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [tab, setTab] = useState(
    location.pathname === "/studio/settings"
      ? "settings"
      : location.pathname === "/test"
        ? "test"
        : "studio",
  );
  const [settings, setSettings] = useState<Settings | null>(null);
  const load = useCallback(async () => {
    try {
      const data = await api<{
        preview: Output;
        program: Output;
        favorites: string[];
      }>("/api/studio");
      setInitial(data.preview);
      setProgram(data.program);
      setFavorites(data.favorites);
      setSettings((s) => s ?? data.preview.settings);
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      api<Health>("/health")
        .then(setHealth)
        .catch(() => setHealth(null));
    }, 3000);
    void api<Health>("/health").then(setHealth);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (output) void load();
  }, [output, load]);
  const command = useCallback(
    (path: string, body: unknown) => {
      pendingCount.current++;
      setPending(true);
      const task = commandQueue.current.then(async () => {
        try {
          setError("");
          await api(path, body);
          await load();
        } catch (e) {
          setError(String(e));
        } finally {
          pendingCount.current--;
          setPending(pendingCount.current > 0);
        }
      });
      commandQueue.current = task;
      return task;
    },
    [load],
  );
  const patch = useCallback(
    (body: Partial<BroadcastState>) => command("/api/preview", body),
    [command],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const index = Number(e.key) - 1;
      if (index >= 0 && index < scenes.length) {
        e.preventDefault();
        void patch({ scene: scenes[index][0] });
      }
      if (e.code === "Space" || e.key === "Escape") {
        e.preventDefault();
        void command(
          `/api/broadcast/${e.code === "Space" ? "take" : "clear"}`,
          {},
        );
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [patch, command]);
  if (!current)
    return (
      <main className="studio-loading">Carregando estado persistido…</main>
    );
  const { state, result } = current;
  const candidates = (result?.candidates ?? []).filter(
    (c) =>
      normalizeName(
        `${c.name} ${c.ballotName} ${c.number} ${c.partyAcronym} ${c.partyName}`,
      ).includes(normalizeName(query)) &&
      (!onlyFavorites || favorites.includes(c.id)),
  );
  const compare = (id: string) => {
    const ids =
      state.scene === "compare" && state.selectedCandidateIds.includes(id)
        ? state.selectedCandidateIds.filter((c) => c !== id)
        : [...new Set([...state.selectedCandidateIds, id])];
    if (ids.length > 4) {
      setError("Comparação limitada a quatro candidatos.");
      return;
    }
    void patch({ scene: "compare", selectedCandidateIds: ids });
  };
  async function diagnose() {
    setDiagnosing(true);
    setError("");
    try {
      setDiagnostics(await api("/api/diagnostics", {}));
    } catch (e) {
      setError(String(e));
    } finally {
      setDiagnosing(false);
    }
  }
  return (
    <div className="studio">
      <header className="studio-header">
        <div className="studio-wordmark">
          ELECTION <b>BROADCAST 2026</b>
        </div>
        <nav>
          <button
            className={tab === "studio" ? "active" : ""}
            onClick={() => setTab("studio")}
          >
            Operação
          </button>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            Configuração
          </button>
          {current.dataMode === "mock" && (
            <button
              className={tab === "test" ? "active" : ""}
              onClick={() => setTab("test")}
            >
              Ensaio
            </button>
          )}
        </nav>
        <button
          onClick={async () => {
            await api("/api/logout", {});
            onLogout();
          }}
        >
          Sair
        </button>
      </header>
      {current.dataMode !== "tse" && (
        <div className="simulation-banner">
          SIMULAÇÃO{" "}
          <span>
            {current.dataMode === "tse-sim"
              ? "Ambiente de testes do TSE • isolado do oficial"
              : "Dados fictícios • ambiente isolado do oficial"}
          </span>
        </div>
      )}
      <div className="status-strip">
        {[
          ["SERVER", health?.server === "ok"],
          ["TSE", health?.tse === "ok" || health?.tse === "simulation"],
          ["CACHE", health?.database === "ok"],
          ["OVERLAY", !!health?.overlayClients],
          ["SSE", connected],
        ].map(([label, ok]) => (
          <span key={String(label)}>
            <i className={ok ? "ok" : "warn"} />
            {label}
          </span>
        ))}
        <span className="status-detail">
          Última consulta{" "}
          {health?.lastFetchAt ? formatTime(health.lastFetchAt) : "—"} &nbsp; •
          &nbsp; Alteração{" "}
          {health?.lastChangedAt ? formatTime(health.lastChangedAt) : "—"}{" "}
          &nbsp; • &nbsp; {health?.metrics.averageLatency ?? 0} ms
        </span>
        <strong>
          {current.dataMode === "tse"
            ? "OFICIAL"
            : current.dataMode === "tse-sim"
              ? "SIMULADO TSE"
              : "MOCK"}
        </strong>
      </div>
      {program?.state.hold && (
        <div className="hold-banner">
          HOLD ATIVO — conteúdo no ar congelado{" "}
          <button onClick={() => void command("/api/broadcast/hold", {})}>
            Liberar HOLD
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>Fechar</button>
        </div>
      )}
      {health?.error && (
        <div className="source-warning">
          ⚠ {health.error} • Último resultado preservado.{" "}
          {health.lastSnapshotAt &&
            `Recebido ${formatTime(health.lastSnapshotAt)}`}
        </div>
      )}
      {!health?.error && result?.progressStatus === "n" && (
        <div className="source-note">
          {current.dataMode === "tse" ? "TSE conectado" : "Ensaio conectado"} •
          Resultado oficial ainda sem totalização.
        </div>
      )}
      {!health?.error &&
        health?.freshness === "DELAYED" &&
        result?.progressStatus !== "n" &&
        health.lastChangedAt && (
          <div className="source-warning">
            Dados sem nova alteração há{" "}
            {Math.max(
              0,
              Math.floor(
                (Date.now() - Date.parse(health.lastChangedAt)) / 1000,
              ),
            )}
            s. Fonte acessível. Último resultado:{" "}
            {formatTime(result?.generatedAt ?? health.lastChangedAt)}.
          </div>
        )}
      {tab === "studio" ? (
        <main className="operation">
          <section className="operator-panel">
            <div className="section-title">
              <h1>Controle de apuração</h1>
              <span>
                {result
                  ? `${result.candidates.length} candidatos`
                  : "Aguardando dados oficiais"}
              </span>
            </div>
            <div className="filters">
              <label>
                Abrangência
                <select
                  aria-label="Abrangência"
                  value={state.scope}
                  onChange={(e) =>
                    void patch({
                      scope: e.target.value as BroadcastState["scope"],
                      ...(e.target.value === "br"
                        ? { officeCode: "0001" }
                        : {}),
                    })
                  }
                >
                  <option value="municipality">Teófilo Otoni • MG</option>
                  <option value="state">Minas Gerais</option>
                  <option value="br">Brasil</option>
                </select>
              </label>
              <label>
                Cargo
                <select
                  aria-label="Cargo"
                  value={state.officeCode}
                  onChange={(e) =>
                    void patch({
                      officeCode: e.target
                        .value as BroadcastState["officeCode"],
                    })
                  }
                >
                  {Object.entries(offices).map(([code, name]) => (
                    <option
                      key={code}
                      value={code}
                      disabled={
                        (state.scope === "br" && code !== "0001") ||
                        code === "0008"
                      }
                    >
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="scene-selector">
              {scenes.map(([id, label], index) => (
                <button
                  key={id}
                  aria-pressed={state.scene === id}
                  className={state.scene === id ? "selected" : ""}
                  onClick={() => void patch({ scene: id })}
                >
                  <kbd>{index + 1}</kbd>
                  {id === "top" ? `TOP ${state.topCount}` : label}
                </button>
              ))}
            </div>
            <div className="search-row">
              <input
                type="search"
                aria-label="Buscar candidato"
                placeholder="Buscar candidato por nome, número ou partido"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className={onlyFavorites ? "selected" : ""}
                onClick={() => setOnlyFavorites(!onlyFavorites)}
              >
                ★ Favoritos
              </button>
            </div>
            <div className="table-note">
              <span>Ordenação: votos computados pelo TSE</span>
              <button onClick={() => void patch({ selectedCandidateIds: [] })}>
                Limpar seleção ({state.selectedCandidateIds.length}/4)
              </button>
            </div>
            {current.dataMode !== "mock" && health?.photos && (
              <div className="table-note" role="status">
                <span>
                  Fotos do cargo: {health.photos.cached}/{health.photos.total}{" "}
                  em cache
                  {health.photos.queued > 0 &&
                    ` • ${health.photos.queued} na fila`}
                  {health.photos.failed > 0 &&
                    ` • ${health.photos.failed} com falha/indisponíveis (rever após 10 min)`}
                  {health.photos.pausedUntil > Date.now() &&
                    " • pausa de proteção da fonte"}
                </span>
                <button
                  disabled={pending || health.photos.pausedUntil > Date.now()}
                  title="Nova tentativa das ausentes respeita intervalo mínimo de 10 minutos após falha."
                  onClick={() => void command("/api/photos", {})}
                >
                  Rever fotos ausentes
                </button>
              </div>
            )}
            <div className="candidate-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Candidato</th>
                    <th>Partido</th>
                    <th>Votos</th>
                    <th>%</th>
                    <th>Situação oficial</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className={
                        state.selectedCandidateIds.includes(c.id)
                          ? "candidate-selected"
                          : ""
                      }
                    >
                      <td>
                        <div className="table-identity">
                          <CandidatePhoto candidate={c} />
                          <div>
                            <strong>{c.ballotName}</strong>
                            <small>{c.number}</small>
                          </div>
                        </div>
                      </td>
                      <td>{c.partyAcronym}</td>
                      <td>{formatVotes(c.votes)}</td>
                      <td>{formatPercent(c.percentage)}</td>
                      <td>
                        {c.officialStatus ??
                          (c.destination && c.destination !== "Válido"
                            ? c.destination
                            : "—")}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            disabled={pending}
                            aria-pressed={
                              state.scene === "candidate" &&
                              state.selectedCandidateIds[0] === c.id
                            }
                            onClick={() =>
                              void patch({
                                scene: "candidate",
                                selectedCandidateIds: [c.id],
                              })
                            }
                          >
                            INDIVIDUAL
                          </button>
                          <button
                            disabled={pending}
                            aria-pressed={
                              state.scene === "compare" &&
                              state.selectedCandidateIds.includes(c.id)
                            }
                            onClick={() => compare(c.id)}
                          >
                            COMPARAR
                          </button>
                          <button
                            aria-label={`Favoritar ${c.ballotName}`}
                            aria-pressed={favorites.includes(c.id)}
                            onClick={() =>
                              void command("/api/favorites", { id: c.id })
                            }
                          >
                            {favorites.includes(c.id) ? "★" : "☆"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!candidates.length && (
                <div className="empty">
                  {result
                    ? "Nenhum candidato encontrado."
                    : "AGUARDANDO DADOS OFICIAIS"}
                </div>
              )}
            </div>
          </section>
          <aside className="preview-panel">
            <div className="section-title">
              <h2>Preview</h2>
              <span>1920 × 1080</span>
            </div>
            <div className="preview-frame">
              <iframe
                title="Preview do overlay"
                src="/overlay/program?preview=1"
              />
            </div>
            <div className="preview-note">
              A mesma tela vai para a transmissão • a guia de área segura
              aparece só aqui
            </div>
            <div className="transmission">
              <span className={program?.state.visible ? "onair" : "offair"}>
                {program?.state.visible ? "● NO AR" : "○ FORA DO AR"}
              </span>
              <div className="take-clear">
                <button
                  className="take"
                  onClick={() => void command("/api/broadcast/take", {})}
                >
                  TAKE <small>COLOCAR NO AR · ESPAÇO</small>
                </button>
                <button
                  className="clear"
                  onClick={() => void command("/api/broadcast/clear", {})}
                >
                  CLEAR <small>RETIRAR · ESC</small>
                </button>
              </div>
              <button
                className={`hold ${program?.state.hold ? "selected" : ""}`}
                onClick={() => void command("/api/broadcast/hold", {})}
              >
                {program?.state.hold
                  ? "LIBERAR HOLD"
                  : "HOLD · CONGELAR CONTEÚDO"}
              </button>
            </div>
            <fieldset className="visual-settings">
              <legend>Composição</legend>
              <label>
                Posição
                <select
                  value={state.position}
                  onChange={(e) =>
                    void patch({
                      position: e.target.value as BroadcastState["position"],
                    })
                  }
                >
                  {[
                    "top-left",
                    "top-center",
                    "top-right",
                    "bottom-left",
                    "bottom-center",
                    "bottom-right",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <div className="inline-fields">
                <label>
                  Candidatos
                  <select
                    value={state.topCount}
                    onChange={(e) =>
                      void patch({ topCount: Number(e.target.value) })
                    }
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Escala
                  <select
                    value={state.scale}
                    onChange={(e) =>
                      void patch({ scale: Number(e.target.value) })
                    }
                  >
                    {[0.4, 0.5, 0.65, 0.8, 1].map((n) => (
                      <option key={n} value={n}>
                        {Math.round(n * 100)}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {(
                [
                  ["showParty", "Partido"],
                  ["showVotes", "Votos"],
                  ["showPhoto", "Foto"],
                  ["showTimestamp", "Horário"],
                ] as const
              ).map(([field, label]) => (
                <label className="checkbox" key={field}>
                  <input
                    type="checkbox"
                    checked={state[field]}
                    onChange={(e) => void patch({ [field]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <label>
                Margem segura no preview
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={state.safeArea}
                  onChange={(e) =>
                    void patch({ safeArea: Number(e.target.value) })
                  }
                />
              </label>
            </fieldset>
            <div className="output-actions">
              <a href="/overlay/program" target="_blank" rel="noreferrer">
                Abrir a saída ↗
              </a>
            </div>
          </aside>
        </main>
      ) : tab === "settings" && settings ? (
        <main className="settings-page">
          <h1>Identidade da emissora</h1>
          <p>
            Marca opcional. Sem configuração, o overlay exibe somente os dados
            eleitorais.
          </p>
          <label>
            Nome da emissora
            <input
              value={settings.stationName}
              onChange={(e) =>
                setSettings({ ...settings, stationName: e.target.value })
              }
            />
          </label>
          <label>
            Cor principal
            <input
              type="color"
              value={settings.primaryColor}
              onChange={(e) =>
                setSettings({ ...settings, primaryColor: e.target.value })
              }
            />
          </label>
          <label>
            Logo (PNG, JPEG ou WebP, até 2 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const form = new FormData();
                  form.append("logo", file);
                  const response = await fetch("/api/settings/logo", {
                    method: "POST",
                    headers: { "X-Studio-Request": "1" },
                    body: form,
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setSettings((previous) =>
                    previous
                      ? { ...previous, stationLogo: data.stationLogo }
                      : data,
                  );
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          </label>
          {settings.stationLogo && (
            <img
              className="settings-logo"
              src={settings.stationLogo}
              alt="Logo da emissora"
            />
          )}
          <button
            onClick={() => setSettings({ ...settings, stationLogo: null })}
          >
            Remover logo
          </button>
          <button
            className="primary"
            onClick={() => void command("/api/settings", settings)}
          >
            Salvar identidade
          </button>
        </main>
      ) : (
        <main className="test-page">
          <h1>Painel de ensaio broadcast</h1>
          <p>
            As falhas simuladas percorrem a validação e a persistência do motor.
          </p>
          {current.dataMode === "mock" ? (
            <div className="test-buttons">
              {[
                ["a", "+ votos candidato A"],
                ["b", "+ votos candidato B"],
                ["swap", "Trocar líder"],
                ...["0", "3", "12", "25", "50", "75", "99", "100"].map((p) => [
                  `progress:${p}`,
                  `${p}% apurado`,
                ]),
                ["offline", "TSE OFFLINE"],
                ["online", "TSE ONLINE"],
                ["invalid", "JSON INVÁLIDO"],
                ["partial", "JSON PARCIAL"],
                ["timeout", "TIMEOUT"],
                ["photo", "FOTO AUSENTE"],
                ["substitute", "CANDIDATO SUBSTITUÍDO"],
                ["annulled", "ANULADO"],
                ["subjudice", "ANULADO SUB JUDICE"],
                ["runoff", "SEGUNDO TURNO"],
                ["pause", "PAUSAR / RETOMAR PROGRESSÃO"],
              ].map(([action, label]) => (
                <button
                  key={action}
                  onClick={() => void command("/api/mock", { action })}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p>Indisponível no modo oficial.</p>
          )}
        </main>
      )}
      <details className="technical-panel">
        <summary>
          Painel técnico • {health?.freshness ?? "SEM CONEXÃO"} •{" "}
          {health?.sseClients ?? 0} conexões SSE
        </summary>
        <div className="technical-actions">
          <button onClick={() => void diagnose()} disabled={diagnosing}>
            {diagnosing ? "DIAGNÓSTICO EM ANDAMENTO…" : "EXECUTAR DIAGNÓSTICO"}
          </button>
          <a className="button" href="/api/admin/export">
            Exportar backup
          </a>
          <span>
            Último snapshot:{" "}
            {health?.lastSnapshotAt
              ? formatTime(health.lastSnapshotAt)
              : "nenhum"}
          </span>
        </div>
        {diagnostics.map((d) => (
          <div className="diagnostic-row" key={d.name}>
            <b className={`diagnostic-${d.status}`}>{d.status}</b>
            <strong>{d.name}</strong>
            <span>{d.detail}</span>
            <small>{d.durationMs} ms</small>
          </div>
        ))}
        <pre>{JSON.stringify(health, null, 2)}</pre>
      </details>
    </div>
  );
}
