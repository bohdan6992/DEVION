// lib/sifterClient.ts
import { bridgeUrl } from "@/lib/bridgeBase";

async function readErrorText(res: Response) {
  try {
    const txt = await res.text();
    return txt ? ` — ${txt.slice(0, 500)}` : "";
  } catch {
    return "";
  }
}

export type SifterMetric = "gapPct" | "clsToClsPct" | "pctChange" | "sigma";

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

  // ✅ added for Metric select + perf calc
  pctChange?: number | null;
  sigma?: number | null;

  marketCapM?: number | null;
  sectorL3?: string | null;

  exchange?: string | null;
  adv?: number | null;

  mdnPreMhVol90?: number | null;
  preMhMDV90NF?: number | null;
  preMhMDV20NF?: number | null;
  mdnPostMhVol90NF?: number | null;

  imbExch?: string | null;
  imbExchValue?: number | null;
  refPrcExch?: string | null;
  refPrcARCA?: number | null;
  imbARCA?: number | null;
};

export async function postSifterDays(body: SifterDaysRequest): Promise<{ rows: SifterDayRow[] }> {
  const res = await fetch(bridgeUrl("/api/sifter/days"), {
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
  metric: SifterMetric; // ✅ unified metric keys
  tickers?: string[] | null;
  sectorL3?: string | null;
  minMarketCapM?: number | null;
  maxMarketCapM?: number | null;
};

export type SifterTickerdaysResult = {
  requestId?: string | null;
  status?: number | null;
  message?: string | null;
  progress?: number | null;
  days?: any[];
};

function normalizeMetric(m: any): SifterMetric {
  // accept old values if they leak from storage
  const x = String(m ?? "").trim();
  if (x === "gapPct" || x === "clsToClsPct" || x === "pctChange" || x === "sigma") return x;
  const low = x.toLowerCase();
  if (low === "gappct") return "gapPct";
  if (low === "clstocls" || low === "clstocls_pct" || low === "clstocls_pct" || low === "clstoclpct") return "clsToClsPct";
  if (low === "clstocls pct" || low === "clstocls_pct") return "clsToClsPct";
  if (low === "pctchange") return "pctChange";
  return "gapPct";
}

export async function postSifterWindow(body: SifterWindowRequest): Promise<SifterTickerdaysResult> {
  const res = await fetch(bridgeUrl("/api/sifter/window"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, metric: normalizeMetric(body.metric) }),
  });

  if (!res.ok) {
    const extra = await readErrorText(res);
    throw new Error(`Sifter window failed: ${res.status}${extra}`);
  }

  return res.json();
}