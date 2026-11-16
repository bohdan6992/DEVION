import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { OPGContinuumClass, OPGContinuumMeta, OPGContinuumMetaWire, OPGContinuumSign, OPGContinuumSlice, OPGContinuumSliceWire } from "./types";

/**
 * Bridge client for the OPGContinuum Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/opg-continuum/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/opg-continuum/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/opg-continuum/scout";

let metaPromise: Promise<OPGContinuumMeta> | null = null;
const slicePromises = new Map<string, Promise<OPGContinuumSlice>>();

export function loadOPGContinuumScoutMeta(force = false): Promise<OPGContinuumMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<OPGContinuumMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadOPGContinuumScoutSlice(cls: OPGContinuumClass, sign: OPGContinuumSign): Promise<OPGContinuumSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<OPGContinuumSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
