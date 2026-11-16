import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { OPGFadeClass, OPGFadeMeta, OPGFadeMetaWire, OPGFadeSign, OPGFadeSlice, OPGFadeSliceWire } from "./types";

/**
 * Bridge client for the OPGFade Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/opg-fade/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/opg-fade/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/opg-fade/scout";

let metaPromise: Promise<OPGFadeMeta> | null = null;
const slicePromises = new Map<string, Promise<OPGFadeSlice>>();

export function loadOPGFadeScoutMeta(force = false): Promise<OPGFadeMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<OPGFadeMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadOPGFadeScoutSlice(cls: OPGFadeClass, sign: OPGFadeSign): Promise<OPGFadeSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<OPGFadeSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
