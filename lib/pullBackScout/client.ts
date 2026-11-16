import { apiGet } from "../scanner/api";
import { PULLBACK_CLASSES } from "./types";
import type { PullBackLevels, PullBackLevelsWire, PullBackMeta, PullBackMetaWire, PullBackRatingCell, PullBackRatingCellWire, PullBackTicker } from "./types";

/**
 * Bridge client for the PullBack Scout/Spectr pages — ONE document, unlike every sibling family's
 * two: `/api/pull-back/scout/meta` only. There is no `/scout/trades` route — PullBack's published
 * file has no per-trade columnar log to slice (see types.ts's own header).
 */

const BASE = "/api/pull-back/scout";

let metaPromise: Promise<PullBackMeta> | null = null;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: number | null | undefined) => (isNum(v) ? v : null);

function decodeLevels(lv: PullBackLevelsWire | undefined): PullBackLevels {
  return {
    alphaPos: numOrNull(lv?.ap), alphaNeg: numOrNull(lv?.an),
    alphaNPos: lv?.apn ?? 0, alphaNNeg: lv?.ann ?? 0,
    gammaPos: numOrNull(lv?.gp), gammaNeg: numOrNull(lv?.gn),
    gammaPosP90: numOrNull(lv?.gpP90), gammaNegP90: numOrNull(lv?.gnP90),
    gammaN: lv?.gN ?? 0,
  };
}

function decodeRatingCell(c: PullBackRatingCellWire | undefined): PullBackRatingCell | null {
  if (!c || !(c.total > 0)) return null;
  return {
    total: c.total, wins: c.wins,
    winRate: numOrNull(c.winRate), winRateLb: numOrNull(c.winRateLb),
    meanPnl: numOrNull(c.meanPnl), medianPnl: numOrNull(c.medianPnl), pnlLb: numOrNull(c.pnlLb),
  };
}

function decodeTicker(r: PullBackMetaWire["tickers"][number]): PullBackTicker {
  const levels = {} as PullBackTicker["levels"];
  const rating = {} as PullBackTicker["rating"];
  for (const cls of PULLBACK_CLASSES) {
    levels[cls] = decodeLevels(r.levels?.[cls]);
    const rt = r.ratings?.[cls];
    rating[cls] = { pos: decodeRatingCell(rt?.p), neg: decodeRatingCell(rt?.n) };
  }
  return {
    t: r.t,
    sigma: numOrNull(r.sigma), lambda: numOrNull(r.lambda), lambdaN: r.lambdaN ?? 0,
    levels, rating,
    etf: r.etf ?? null, country: r.country ?? null, sector: r.sector ?? null, exchange: r.exchange ?? null,
    ptp: r.ptp ?? null, ssrOut: r.ssrOut ?? null, crap: r.crap ?? null, rep: r.rep ?? null,
    etb: r.etb ?? null, news: r.news ?? null,
  };
}

function decodeMeta(w: PullBackMetaWire): PullBackMeta {
  return {
    generatedAt: w.meta.generatedAt,
    mostRecentSession: w.meta.mostRecentSession,
    minDev: w.meta.minDev,
    sessionsSeen: w.meta.sessionsSeen,
    tickers: w.tickers.map(decodeTicker),
  };
}

export function loadPullBackScoutMeta(force = false): Promise<PullBackMeta> {
  if (force) metaPromise = null;
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<PullBackMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}
