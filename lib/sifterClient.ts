// lib/sifterClient.ts
export type SifterDaysRequest = {
  fromDateNy: string;
  toDateNy: string;
  tickers?: string[] | null;
  sectorL3?: string | null;
  minMarketCapM?: number | null;
  maxMarketCapM?: number | null;
  minGapPct?: number | null;
  maxGapPct?: number | null;
  minClsToClsPct?: number | null;
  maxClsToClsPct?: number | null;
};

export type SifterDayRow = {
  dateNy: string;
  ticker: string;
  gapPct?: number | null;
  clsToClsPct?: number | null;
  marketCapM?: number | null;
  sectorL3?: string | null;

  // display-only extras (optional)
  exchange?: string | null;
  adv?: number | null;
};

export async function postSifterDays(body: SifterDaysRequest): Promise<{ rows: SifterDayRow[] }> {
  const res = await fetch("/api/sifter/days", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sifter days failed: ${res.status}`);
  return res.json();
}

export type SifterWindowRequest = {
  fromDateNy: string;
  toDateNy: string;
  minuteFrom: string; // "09:31"
  minuteTo: string;   // "10:15"
  metric: string;     // e.g. "SigmaZapS"
  tickers?: string[] | null;
  sectorL3?: string | null;
  minMarketCapM?: number | null;
};

export async function postSifterWindow(body: SifterWindowRequest): Promise<any> {
  const res = await fetch("/api/sifter/window", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sifter window failed: ${res.status}`);
  return res.json();
}
