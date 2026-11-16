import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { OPGReversalClass, OPGReversalMeta, OPGReversalMetaWire, OPGReversalSign, OPGReversalSlice, OPGReversalSliceWire } from "./types";

/**
 * Bridge client for the OPGReversal Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/opg-reversal/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/opg-reversal/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/opg-reversal/scout";

let metaPromise: Promise<OPGReversalMeta> | null = null;
const slicePromises = new Map<string, Promise<OPGReversalSlice>>();

export function loadOPGReversalScoutMeta(force = false): Promise<OPGReversalMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<OPGReversalMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadOPGReversalScoutSlice(cls: OPGReversalClass, sign: OPGReversalSign): Promise<OPGReversalSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<OPGReversalSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
