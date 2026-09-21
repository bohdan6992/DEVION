import { apiGet } from "../scanner/api";
import { decodePfMeta, decodePfSlice } from "./compute";
import type { PfScoutClass, PfScoutMeta, PfScoutMetaWire, PfScoutSign, PfScoutSlice, PfScoutSliceWire } from "./types";

/**
 * Bridge client for the PairFlux Scout page — mirrors lib/scout/client.ts (Arbitrage Scout).
 *
 *   /api/pairflux/scout/meta    session list + pair table
 *   /api/pairflux/scout/trades  one (class, sign) episode log in columnar form
 */

const BASE = "/api/pairflux/scout";

let metaPromise: Promise<PfScoutMeta> | null = null;
const slicePromises = new Map<string, Promise<PfScoutSlice>>();

export function loadPfScoutMeta(force = false): Promise<PfScoutMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<PfScoutMetaWire>(url)
      .then(decodePfMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadPfScoutSlice(cls: PfScoutClass, sign: PfScoutSign): Promise<PfScoutSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<PfScoutSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodePfSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
