// lib/sifterClient.ts

async function readErrorText(res: Response) {
  try {
    const txt = await res.text();
    return txt ? ` — ${txt.slice(0, 500)}` : "";
  } catch {
    return "";
  }
}

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

  // optional: future filters (safe to send as null/undefined)
  minMdnPreMhVol90?: number | null;
  maxMdnPreMhVol90?: number | null;

  minPreMhMDV90NF?: number | null;
  maxPreMhMDV90NF?: number | null;

  minPreMhMDV20NF?: number | null;
  maxPreMhMDV20NF?: number | null;

  minMdnPostMhVol90NF?: number | null;
  maxMdnPostMhVol90NF?: number | null;

  imbExch?: string | null;
  minImbExchValue?: number | null;
  maxImbExchValue?: number | null;

  refPrcExch?: string | null;
  minRefPrcARCA?: number | null;
  maxRefPrcARCA?: number | null;

  minImbARCA?: number | null;
  maxImbARCA?: number | null;
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

  // optional (medians)
  mdnPreMhVol90?: number | null;
  preMhMDV90NF?: number | null;
  preMhMDV20NF?: number | null;
  mdnPostMhVol90NF?: number | null;

  // optional (imbalance)
  imbExch?: string | null;
  imbExchValue?: number | null;
  refPrcExch?: string | null;
  refPrcARCA?: number | null;
  imbARCA?: number | null;
};

export async function postSifterDays(body: SifterDaysRequest): Promise<{ rows: SifterDayRow[] }> {
  const res = await fetch("/api/sifter/days", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const extra = await readErrorText(res);
    throw new Error(`Sifter days failed: ${res.status}${extra}`);
  }

  return res.json();
}

export type SifterWindowRequest = {
  fromDateNy: string;
  toDateNy: string;
  minuteFrom: string; // "09:31"
  minuteTo: string; // "10:15"
  metric: string; // e.g. "SigmaZapS"
  tickers?: string[] | null;
  sectorL3?: string | null;
  minMarketCapM?: number | null;

  // if your backend supports it later:
  maxMarketCapM?: number | null;
};

export type SifterTickerdaysResult = {
  requestId?: string | null;
  status?: number | null; // (depends on backend enum)
  message?: string | null;
  progress?: number | null; // 0..1

  // main payload used by SifterPanel
  days?: any[]; // keep loose for now because backend may change shape
};

export async function postSifterWindow(body: SifterWindowRequest): Promise<SifterTickerdaysResult> {
  const res = await fetch("/api/sifter/window", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const extra = await readErrorText(res);
    throw new Error(`Sifter window failed: ${res.status}${extra}`);
  }

  return res.json();
}
