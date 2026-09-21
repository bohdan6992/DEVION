import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { ScoutClass, ScoutMeta, ScoutMetaWire, ScoutSign, ScoutSlice, ScoutSliceWire } from "./types";

/**
 * Bridge client for the Scout page. Two documents, both small enough to keep in memory:
 *
 *   /api/arbitrage/scout/meta    session list + ticker table (beta/corr/sigma, gamma/delta/alpha)
 *   /api/arbitrage/scout/trades  one (class, sign) trade log in columnar form
 *
 * The first meta request is slow on a cold bridge: it downloads and parses the 162 MB published
 * file (~10 s). Everything after that is served from the bridge's memory. Slices are cached here per
 * (class, sign) for the life of the page, keyed by the file's generation stamp, so flipping between
 * classes never fetches twice.
 */

const BASE = "/api/arbitrage/scout";

let metaPromise: Promise<ScoutMeta> | null = null;
const slicePromises = new Map<string, Promise<ScoutSlice>>();

export function loadScoutMeta(force = false): Promise<ScoutMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<ScoutMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null; // a failed load must not be remembered
        throw e;
      });
  }
  return metaPromise;
}

export function loadScoutSlice(cls: ScoutClass, sign: ScoutSign): Promise<ScoutSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<ScoutSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
