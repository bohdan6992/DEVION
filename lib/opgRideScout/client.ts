import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { OPGRideClass, OPGRideMeta, OPGRideMetaWire, OPGRideSign, OPGRideSlice, OPGRideSliceWire } from "./types";

/**
 * Bridge client for the OPGRide Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/opg-ride/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/opg-ride/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/opg-ride/scout";

let metaPromise: Promise<OPGRideMeta> | null = null;
const slicePromises = new Map<string, Promise<OPGRideSlice>>();

export function loadOPGRideScoutMeta(force = false): Promise<OPGRideMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<OPGRideMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadOPGRideScoutSlice(cls: OPGRideClass, sign: OPGRideSign): Promise<OPGRideSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<OPGRideSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
