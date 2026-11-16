import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { StretchRideClass, StretchRideMeta, StretchRideMetaWire, StretchRideSign, StretchRideSlice, StretchRideSliceWire } from "./types";

/**
 * Bridge client for the StretchRide Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/stretch-ride/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/stretch-ride/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/stretch-ride/scout";

let metaPromise: Promise<StretchRideMeta> | null = null;
const slicePromises = new Map<string, Promise<StretchRideSlice>>();

export function loadStretchRideScoutMeta(force = false): Promise<StretchRideMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<StretchRideMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadStretchRideScoutSlice(cls: StretchRideClass, sign: StretchRideSign): Promise<StretchRideSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<StretchRideSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
