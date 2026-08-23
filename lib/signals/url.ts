/**
 * The signals feed URL, built in one place.
 *
 * Every live surface — Sonar, Stream (via streamEngine) and the Scanner's tape-meta store — reads
 * the same SSE feed. The builder for that URL existed as two copies, one per Sonar, and the copies
 * had drifted by a single character with a real consequence:
 *
 *   Arbitrage:  Number.isFinite(minTotal) ? Math.max(0, trunc(minTotal)) : BIN_SERVER_MIN_TOTAL
 *   OpenDoor:   Number.isFinite(minTotal) ? Math.max(1, trunc(minTotal)) : BIN_SERVER_MIN_TOTAL
 *
 * OpenDoor Sonar deliberately passes `minRate: 0, minTotal: 0` — with a comment saying the server
 * must NOT pre-thin the feed by Arbitrage's rating, because OpenDoor's own per-bin table is the
 * only rating allowed to reject a ticker. Its own builder then clamped that 0 up to 1, so the feed
 * WAS pre-thinned. The OpenDoor Stream never was, because streamEngine imports the Arbitrage
 * builder — so the two surfaces of one strategy watched different universes.
 *
 * `Math.max(0, …)` is the correct clamp and the one kept here: 0 means "no floor", and the caller
 * asking for no floor must get no floor.
 *
 * ## Which strategy's endpoint this hits
 *
 * `signalsBase` defaults to `/api/arbitrage`, which is where EVERY surface points today —
 * including both OpenDoor ones. That is deliberate on OpenDoor's part: it uses this endpoint as a
 * raw universe feed (zero floors, `skipArbitrageRating`) and applies its own gate client-side in
 * lib/opendoor/gate.ts. It was NOT, however, a decision anyone made here — it was a path literal
 * baked into a forked file. It is now a parameter, so pointing a strategy at its own endpoint is a
 * one-line change at the call site rather than an edit inside a 6k-line component.
 *
 * Note the bridge also serves `/api/opendoor/signals`, backed by OpenDoorSignalsHandler, which
 * computes that same gate server-side. Nothing calls it. Repointing OpenDoor at it is a real
 * behaviour change (a different payload shape, and the gate moving from client to server), so it
 * is a separate decision — not something this extraction should do silently.
 */

export type SignalsClass =
  | "blue" | "ark" | "pre" | "print" | "open" | "intra" | "post" | "global";
export type SignalsType = "any" | "hard" | "soft";
export type SignalsMode = "top" | "all";
export type SignalsRatingMode = "SESSION" | "BIN" | "BINS";
export type SignalsZapMode = "zap" | "sigma" | "delta" | "off";

/**
 * Same env var and same localhost fallback the Sonars used. Deliberately NOT lib/bridgeBase.ts:
 * that module reads a DIFFERENT variable (`NEXT_PUBLIC_BRIDGE_API`) and throws during SSR, so
 * switching to it here would change which bridge these surfaces talk to whenever only one of the
 * two variables is set. Unifying the two is worth doing — separately, and on purpose.
 */
const BRIDGE_BASE = process.env.NEXT_PUBLIC_TRADING_BRIDGE_URL ?? "http://localhost:5197";

/** Floors used when the caller supplies nothing usable. */
export const BIN_SERVER_MIN_RATE = 0.3;
export const BIN_SERVER_MIN_TOTAL = 1;

/** Default endpoint family. See the note above on why OpenDoor also points here. */
export const DEFAULT_SIGNALS_BASE = "/api/arbitrage";

export type SignalsUrlArgs = {
  cls: SignalsClass;
  type: SignalsType;
  mode: SignalsMode;
  ratingMode: SignalsRatingMode;
  zapMode: SignalsZapMode;
  minRate: number;
  minTotal: number;
  startAbs?: number | null;
  limit?: number;
  tickers?: string;
  minCorr?: number | null;
  maxCorr?: number | null;
  minBeta?: number | null;
  maxBeta?: number | null;
  minSigma?: number | null;
  maxSigma?: number | null;
  includeAll?: boolean;
  /** Endpoint family, e.g. `/api/opendoor`. Defaults to `/api/arbitrage`. No trailing slash. */
  signalsBase?: string;
};

export function buildSignalsUrl(args: SignalsUrlArgs) {
  const {
    cls,
    type,
    mode,
    ratingMode,
    zapMode,
    minRate,
    minTotal,
    startAbs,
    limit,
    tickers,
    minCorr,
    maxCorr,
    minBeta,
    maxBeta,
    minSigma,
    maxSigma,
    includeAll,
    signalsBase,
  } = args;

  const base = (signalsBase ?? DEFAULT_SIGNALS_BASE).replace(/\/+$/, "");
  const u = new URL(`${BRIDGE_BASE}${base}/signals/${cls}/${type}/${mode}`);

  const useBinRatingFilter = (ratingMode === "BIN" || ratingMode === "BINS") && zapMode === "sigma";
  const safeMinRate = useBinRatingFilter
    ? BIN_SERVER_MIN_RATE
    : Number.isFinite(minRate) ? Math.max(0, minRate) : BIN_SERVER_MIN_RATE;
  // Math.max(0, …), never 1 — see the header: a caller asking for no floor must get no floor.
  const safeMinTotal = useBinRatingFilter
    ? BIN_SERVER_MIN_TOTAL
    : Number.isFinite(minTotal) ? Math.max(0, Math.trunc(minTotal)) : BIN_SERVER_MIN_TOTAL;

  u.searchParams.set("minRate", String(safeMinRate));
  u.searchParams.set("minTotal", String(safeMinTotal));
  u.searchParams.set("limit", String(Number.isFinite(limit as number) ? Math.max(1, Math.trunc(limit as number)) : 5000));

  const t = (tickers ?? "").trim();
  if (t) u.searchParams.set("tickers", t);

  const setOptional = (key: string, value: number | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      u.searchParams.set(key, String(value));
    }
  };

  setOptional("startAbs", startAbs);
  setOptional("minCorr", minCorr);
  setOptional("maxCorr", maxCorr);
  setOptional("minBeta", minBeta);
  setOptional("maxBeta", maxBeta);
  setOptional("minSigma", minSigma);
  setOptional("maxSigma", maxSigma);
  if (includeAll) {
    u.searchParams.set("includeAll", "true");
  }

  return u.toString();
}

export function buildSignalsStreamUrl(args: SignalsUrlArgs) {
  const base = (args.signalsBase ?? DEFAULT_SIGNALS_BASE).replace(/\/+$/, "");
  const snapshotUrl = new URL(buildSignalsUrl(args));
  snapshotUrl.pathname = snapshotUrl.pathname.replace(`${base}/signals/`, `${base}/signals-stream/`);
  // Stream payloads stay intentionally smaller than one-shot snapshots.
  snapshotUrl.searchParams.set("limit", String(Number.isFinite(args.limit as number) ? Math.max(1, Math.trunc(args.limit as number)) : 5000));
  return snapshotUrl.toString();
}
