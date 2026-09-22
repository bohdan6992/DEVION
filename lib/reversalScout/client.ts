import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { ReversalClass, ReversalMeta, ReversalMetaWire, ReversalSign, ReversalSlice, ReversalSliceWire } from "./types";

/**
 * Bridge client for the Reversal Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/reversal/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/reversal/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/reversal/scout";

let metaPromise: Promise<ReversalMeta> | null = null;
const slicePromises = new Map<string, Promise<ReversalSlice>>();

export function loadReversalScoutMeta(force = false): Promise<ReversalMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<ReversalMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadReversalScoutSlice(cls: ReversalClass, sign: ReversalSign): Promise<ReversalSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<ReversalSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
