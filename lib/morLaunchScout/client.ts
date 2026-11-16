import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { MorLaunchClass, MorLaunchMeta, MorLaunchMetaWire, MorLaunchSign, MorLaunchSlice, MorLaunchSliceWire } from "./types";

/**
 * Bridge client for the MorLaunch Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/mor-launch/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/mor-launch/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/mor-launch/scout";

let metaPromise: Promise<MorLaunchMeta> | null = null;
const slicePromises = new Map<string, Promise<MorLaunchSlice>>();

export function loadMorLaunchScoutMeta(force = false): Promise<MorLaunchMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<MorLaunchMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadMorLaunchScoutSlice(cls: MorLaunchClass, sign: MorLaunchSign): Promise<MorLaunchSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<MorLaunchSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
