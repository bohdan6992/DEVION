import { apiGet } from "../scanner/api";
import { decodeMeta, decodeSlice } from "./compute";
import type { OPGRootationClass, OPGRootationMeta, OPGRootationMetaWire, OPGRootationSign, OPGRootationSlice, OPGRootationSliceWire } from "./types";

/**
 * Bridge client for the OPGRootation Scout page — the same two-document split as Arbitrage/PairFlux
 * Scout (lib/scout/client.ts):
 *
 *   /api/opg-rootation/scout/meta    session list + ticker table (alphaPos/alphaNeg/sigma, per-class-per-sign rating+gamma)
 *   /api/opg-rootation/scout/trades  one (class, sign) trade log in columnar form
 */

const BASE = "/api/opg-rootation/scout";

let metaPromise: Promise<OPGRootationMeta> | null = null;
const slicePromises = new Map<string, Promise<OPGRootationSlice>>();

export function loadOPGRootationScoutMeta(force = false): Promise<OPGRootationMeta> {
  if (force) {
    metaPromise = null;
    slicePromises.clear();
  }
  if (!metaPromise) {
    const url = force ? `${BASE}/meta?refresh=true` : `${BASE}/meta`;
    metaPromise = apiGet<OPGRootationMetaWire>(url)
      .then(decodeMeta)
      .catch((e) => {
        metaPromise = null;
        throw e;
      });
  }
  return metaPromise;
}

export function loadOPGRootationScoutSlice(cls: OPGRootationClass, sign: OPGRootationSign): Promise<OPGRootationSlice> {
  const key = `${cls}/${sign}`;
  let p = slicePromises.get(key);
  if (!p) {
    p = apiGet<OPGRootationSliceWire>(`${BASE}/trades?cls=${cls}&sign=${sign}`)
      .then(decodeSlice)
      .catch((e) => {
        slicePromises.delete(key);
        throw e;
      });
    slicePromises.set(key, p);
  }
  return p;
}
