// pages/paper/arbitrage.tsx

import React, { useEffect, useMemo, useState } from "react";
import { paperClient, PaperEpisode, PaperObservation } from "../../lib/paperClient";
import { todayNyYmd, fmtNyTime } from "../../lib/time";
import { login, getToken, clearToken } from "../../lib/authClient";

type TabKey = "active" | "episodes";

function num(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  if (Number.isNaN(x)) return "—";
  return x.toFixed(2);
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui" }}>
      {children}
    </div>
  );
}

function Tabs({
  tab,
  setTab,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <button
        onClick={() => setTab("active")}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #333",
          background: tab === "active" ? "#222" : "transparent",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Active
      </button>
      <button
        onClick={() => setTab("episodes")}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #333",
          background: tab === "episodes" ? "#222" : "transparent",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Episodes
      </button>
    </div>
  );
}

function Table({
  rows,
  onDetails,
  showExit,
}: {
  rows: PaperEpisode[];
  onDetails: (ep: PaperEpisode) => void;
  showExit: boolean;
}) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#161616" }}>
            <th style={{ padding: 10, textAlign: "left" }}>Ticker</th>
            <th style={{ padding: 10, textAlign: "left" }}>Dir</th>
            <th style={{ padding: 10, textAlign: "left" }}>Class</th>
            <th style={{ padding: 10, textAlign: "left" }}>Opened (NY)</th>
            <th style={{ padding: 10, textAlign: "left" }}>Last σZap</th>
            <th style={{ padding: 10, textAlign: "left" }}>Peak |σZap|</th>
            {showExit ? <th style={{ padding: 10, textAlign: "left" }}>Exit</th> : null}
            <th style={{ padding: 10 }} />
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.episodeId} style={{ borderTop: "1px solid #333" }}>
              <td style={{ padding: 10, fontWeight: 600 }}>{r.ticker}</td>
              <td style={{ padding: 10 }}>{r.direction ?? "—"}</td>
              <td style={{ padding: 10 }}>{r.openedClass ?? "—"}</td>
              <td style={{ padding: 10 }}>{fmtNyTime(r.openedTimeNy)}</td>
              <td style={{ padding: 10 }}>{num(r.lastZapSigma)}</td>
              <td style={{ padding: 10 }}>{num(r.peakAbsZapSigma)}</td>
              {showExit ? (
                <td style={{ padding: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span>{r.exitReason ?? "—"}</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{fmtNyTime(r.exitTimeNy)}</span>
                  </div>
                </td>
              ) : null}
              <td style={{ padding: 10, textAlign: "right" }}>
                <button
                  onClick={() => onDetails(r)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#222",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Details
                </button>
              </td>
            </tr>
          ))}

          {rows.length === 0 ? (
            <tr>
              <td style={{ padding: 10, opacity: 0.7 }} colSpan={showExit ? 8 : 7}>
                No episodes.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1000px, 100%)",
          background: "#0f0f0f",
          border: "1px solid #333",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 13, opacity: 0.7 }}>{subtitle}</div> : null}
          </div>

          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              height: 34,
            }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function PaperArbitragePage() {
  const strategy = "arbitrage";

  const [tab, setTab] = useState<TabKey>("active");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [activeRows, setActiveRows] = useState<PaperEpisode[]>([]);
  const [episodesRows, setEpisodesRows] = useState<PaperEpisode[]>([]);
  const [episodesDateNy, setEpisodesDateNy] = useState<string>(todayNyYmd());

  // auth UI
  const [email, setEmail] = useState("admin@corp.com");
  const [password, setPassword] = useState("ChangeMe!123");
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);

  // details
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsEpisode, setDetailsEpisode] = useState<PaperEpisode | null>(null);
  const [detailsDateNy, setDetailsDateNy] = useState<string>(todayNyYmd());
  const [detailsObs, setDetailsObs] = useState<PaperObservation[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsErr, setDetailsErr] = useState<string | null>(null);

  const hasToken = !!getToken();

  async function doLogin() {
    setAuthBusy(true);
    setAuthErr(null);
    try {
      await login({ email, password });
      await loadActive(); // одразу підвантажимо
    } catch (e: any) {
      setAuthErr(e?.message ?? String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  function doLogout() {
    clearToken();
    setActiveRows([]);
    setEpisodesRows([]);
    setErr("Logged out (token cleared).");
  }

  async function loadActive() {
    setLoading(true);
    setErr(null);
    try {
      const rows = await paperClient.active(strategy);
      setActiveRows(rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadEpisodes(dateNy: string) {
    setLoading(true);
    setErr(null);
    try {
      const rows = await paperClient.episodes(strategy, dateNy);
      setEpisodesRows(rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(ep: PaperEpisode, dateNy: string) {
    setDetailsEpisode(ep);
    setDetailsDateNy(dateNy);
    setDetailsOpen(true);

    setDetailsLoading(true);
    setDetailsErr(null);
    setDetailsObs([]);

    try {
      const obs = await paperClient.observations(strategy, dateNy, ep.episodeId);
      setDetailsObs((obs ?? []).slice(-30));
    } catch (e: any) {
      setDetailsErr(e?.message ?? String(e));
    } finally {
      setDetailsLoading(false);
    }
  }

  useEffect(() => {
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerRight = useMemo(() => {
    if (tab === "active") {
      return (
        <button
          onClick={loadActive}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#222",
            color: "#fff",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Refresh
        </button>
      );
    }
    return (
      <button
        onClick={() => loadEpisodes(episodesDateNy)}
        disabled={loading}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #333",
          background: "#222",
          color: "#fff",
          cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        Refresh
      </button>
    );
  }, [tab, loading, episodesDateNy]);

  return (
    <PageContainer>
      <div
        style={{
          border: "1px solid #333",
          borderRadius: 14,
          padding: 14,
          background: "#0b0b0b",
          color: "#fff",
        }}
      >
        {/* AUTH PORTAL */}
        {!hasToken ? (
          <div
            style={{
              border: "1px solid #333",
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
              background: "#0f0f0f",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Auth Portal</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "#111",
                  color: "#fff",
                  minWidth: 240,
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "#111",
                  color: "#fff",
                  minWidth: 200,
                }}
              />

              <button
                onClick={doLogin}
                disabled={authBusy}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  background: "#222",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: authBusy ? 0.6 : 1,
                }}
              >
                {authBusy ? "Logging in…" : "Login"}
              </button>

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Uses <code>POST /api/auth/login</code>
              </div>
            </div>

            {authErr ? (
              <div style={{ marginTop: 10, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>
                {authErr}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              onClick={doLogout}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                opacity: 0.9,
              }}
              title="Clear stored JWT token"
            >
              Logout
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Paper Trading — Arbitrage</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>
              Active today (NY) + episodes by date. Details show last 30 observations.
            </div>
          </div>
          {headerRight}
        </div>

        {err ? (
          <div style={{ marginTop: 10, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>{err}</div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <Tabs tab={tab} setTab={setTab} />

          {tab === "active" ? (
            <Table
              rows={activeRows}
              showExit={false}
              onDetails={(ep) => openDetails(ep, todayNyYmd())}
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ opacity: 0.7, fontSize: 13 }}>Date (NY):</div>
                <input
                  type="date"
                  value={episodesDateNy}
                  onChange={(e) => setEpisodesDateNy(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: "#111",
                    color: "#fff",
                  }}
                />
                <button
                  onClick={() => loadEpisodes(episodesDateNy)}
                  disabled={loading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #333",
                    background: "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Load
                </button>
              </div>

              <Table
                rows={episodesRows}
                showExit={true}
                onDetails={(ep) => openDetails(ep, episodesDateNy)}
              />
            </div>
          )}
        </div>
      </div>

      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={`Details — ${detailsEpisode?.ticker ?? "—"} (${detailsEpisode?.direction ?? "—"})`}
        subtitle={`EpisodeId: ${detailsEpisode?.episodeId ?? "—"} · Date (NY): ${detailsDateNy}`}
      >
        {detailsErr ? (
          <div style={{ color: "#ff6b6b", whiteSpace: "pre-wrap" }}>{detailsErr}</div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Entry / Last / Peak</div>
            <div style={{ fontSize: 13, opacity: 0.9, display: "grid", gap: 4 }}>
              <div>Opened: {fmtNyTime(detailsEpisode?.openedTimeNy)}</div>
              <div>Class: {detailsEpisode?.openedClass ?? "—"}</div>
              <div>Entry σZap: {num(detailsEpisode?.entryZapSigma)}</div>
              <div>Last σZap: {num(detailsEpisode?.lastZapSigma)}</div>
              <div>Peak |σZap|: {num(detailsEpisode?.peakAbsZapSigma)}</div>
            </div>
          </div>

          <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Observations (last 30)</div>
            {detailsLoading ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #333", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#161616" }}>
                      <th style={{ padding: 10, textAlign: "left" }}>ts (NY)</th>
                      <th style={{ padding: 10, textAlign: "left" }}>σZap</th>
                      <th style={{ padding: 10, textAlign: "left" }}>|σZap|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsObs.map((o, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid #333" }}>
                        <td style={{ padding: 10, fontFamily: "monospace" }}>{o.tsNy ?? "—"}</td>
                        <td style={{ padding: 10 }}>{num(o.zapSigma)}</td>
                        <td style={{ padding: 10 }}>{num(o.absZapSigma)}</td>
                      </tr>
                    ))}
                    {detailsObs.length === 0 ? (
                      <tr>
                        <td style={{ padding: 10, opacity: 0.7 }} colSpan={3}>
                          No observations.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
