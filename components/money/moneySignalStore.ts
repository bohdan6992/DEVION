"use client";

import { useSyncExternalStore } from "react";
import type { ArbitrageSignal } from "../sonar/ArbitrageSonar";

export type MoneySignalMeta = {
  totalCount: number;
  countries: string[];
  exchanges: string[];
  sectors: string[];
};

const EMPTY_META: MoneySignalMeta = {
  totalCount: 0,
  countries: [],
  exchanges: [],
  sectors: [],
};

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameMeta(left: MoneySignalMeta, right: MoneySignalMeta): boolean {
  return (
    left.totalCount === right.totalCount &&
    sameStringArray(left.countries, right.countries) &&
    sameStringArray(left.exchanges, right.exchanges) &&
    sameStringArray(left.sectors, right.sectors)
  );
}

function extractCountry(signal: ArbitrageSignal): string {
  const raw =
    (signal as any)?.country ??
    (signal as any)?.Country ??
    (signal as any)?.meta?.country ??
    (signal as any)?.meta?.Country ??
    "";
  return String(raw ?? "").trim().toUpperCase();
}

function extractExchange(signal: ArbitrageSignal): string {
  const raw =
    (signal as any)?.exchange ??
    (signal as any)?.Exchange ??
    (signal as any)?.meta?.exchange ??
    (signal as any)?.meta?.Exchange ??
    "";
  return String(raw ?? "").trim().toUpperCase();
}

function extractSector(signal: ArbitrageSignal): string {
  const raw =
    (signal as any)?.sectorL3 ??
    (signal as any)?.SectorL3 ??
    (signal as any)?.sector ??
    (signal as any)?.Sector ??
    (signal as any)?.meta?.sectorL3 ??
    (signal as any)?.meta?.SectorL3 ??
    (signal as any)?.meta?.sector ??
    (signal as any)?.meta?.Sector ??
    "";
  return String(raw ?? "").trim().toUpperCase();
}

function buildMeta(signals: ArbitrageSignal[]): MoneySignalMeta {
  const countries = new Set<string>();
  const exchanges = new Set<string>();
  const sectors = new Set<string>();

  for (const signal of signals) {
    const country = extractCountry(signal);
    const exchange = extractExchange(signal);
    const sector = extractSector(signal);
    if (country) countries.add(country);
    if (exchange) exchanges.add(exchange);
    if (sector) sectors.add(sector);
  }

  return {
    totalCount: signals.length,
    countries: Array.from(countries).sort((left, right) => left.localeCompare(right)),
    exchanges: Array.from(exchanges).sort((left, right) => left.localeCompare(right)),
    sectors: Array.from(sectors).sort((left, right) => left.localeCompare(right)),
  };
}

class MoneySignalStore {
  private meta: MoneySignalMeta = EMPTY_META;
  private listeners = new Set<() => void>();

  getMeta(): MoneySignalMeta {
    return this.meta;
  }

  applySnapshot(signals: ArbitrageSignal[]): void {
    const nextMeta = buildMeta(signals);
    if (sameMeta(this.meta, nextMeta)) return;
    this.meta = nextMeta;
    this.listeners.forEach((listener) => listener());
  }

  clear(): void {
    if (sameMeta(this.meta, EMPTY_META)) return;
    this.meta = EMPTY_META;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const moneySignalStore = new MoneySignalStore();

export function useMoneySignalMeta(): MoneySignalMeta {
  return useSyncExternalStore(
    moneySignalStore.subscribe,
    () => moneySignalStore.getMeta(),
    () => EMPTY_META
  );
}
