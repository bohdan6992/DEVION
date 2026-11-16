import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { StretchFadeClass, StretchFadeMeta, StretchFadeMetaWire, StretchFadeSign, StretchFadeSlice, StretchFadeSliceWire } from "./types";

/**
 * Bridge client for the StretchFade Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/stretch-fade/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/stretch-fade/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/stretch-fade/scout";

let metaPromise: Promise<StretchFadeMeta> | null = null;
const slicePromises = new Map<string, Promise<StretchFadeSlice>>();

export function loadStretchFadeScoutMeta(force = false): Promise<StretchFadeMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<StretchFadeMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadStretchFadeScoutSlice(cls: StretchFadeClass, sign: StretchFadeSign): Promise<StretchFadeSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<StretchFadeSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
