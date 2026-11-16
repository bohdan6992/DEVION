import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { LaunchEveningClass, LaunchEveningMeta, LaunchEveningMetaWire, LaunchEveningSign, LaunchEveningSlice, LaunchEveningSliceWire } from "./types";

/**
 * Bridge client for the LaunchEvening Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/launch-evening/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/launch-evening/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/launch-evening/scout";

let metaPromise: Promise<LaunchEveningMeta> | null = null;
const slicePromises = new Map<string, Promise<LaunchEveningSlice>>();

export function loadLaunchEveningScoutMeta(force = false): Promise<LaunchEveningMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<LaunchEveningMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadLaunchEveningScoutSlice(cls: LaunchEveningClass, sign: LaunchEveningSign): Promise<LaunchEveningSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<LaunchEveningSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
