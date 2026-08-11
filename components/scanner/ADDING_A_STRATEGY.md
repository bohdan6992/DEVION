# Adding a scanner strategy

The target: a new strategy is a **descriptor + a params hook + a controls panel**. No copied markup.

> Status: the descriptor seam (`ScannerStrategyParams` in `lib/scanner/strategy.ts`) is in place.
> `ScannerShell` is still being extracted from `ArbitrageScanner.tsx` — until it lands, a new
> strategy still has to fork a scanner. See the plan for the remaining phases.

## The three pieces

```tsx
// 1. state the strategy owns, and nothing else does
function useMyParams() {
  const [horizon, setHorizon] = useState<"5m" | "15m">("5m");
  const [minEdge, setMinEdge] = useState(0.5);
  return { horizon, setHorizon, minEdge, setMinEdge };
}

// 2. how those reach the bridge — the shell fills in everything shared
function applyTo(request: Record<string, any>, p: ReturnType<typeof useMyParams>) {
  request.horizon = p.horizon;
  request.minEdge = p.minEdge;
}

// 3. the toolbar section
function MyControls({ params }: { params: ReturnType<typeof useMyParams> }) {
  return <GlassSelect value={params.horizon} onChange={(e) => params.setHorizon(e.target.value)} ... />;
}

export const MY_STRATEGY = defineScannerStrategy({
  id: "mystrat",
  label: "MyStrat",
  apiBase: "/api/paper/mystrat",
  nav: { stream: "/mystrat/stream", scanner: "/mystrat/scanner", sonar: "/mystrat/sonar" },
  tradingWindow: { fromMinuteIdx: 570, toMinuteIdx: 960 },
  ratingClasses: { dimension: "HORIZON", keys: ["5m", "15m"], labels: { "5m": "5 min", "15m": "15 min" } },
  params: { use: useMyParams, applyTo, Controls: MyControls },
});
```

## What you do NOT write

Dates and the date-mode rules, the ticker scope (APP/PIN/IGN), the entire filter toolbar and its
persistence, rating rules, sizing and dilution, scope research, the optimizer, the episode and
analytics tables, the charts, CSV export. All shared.

## Rules worth knowing before you start

- **Every input the day build reads must be in the backend's variant key.** OpenDoor learned this
  the expensive way: its ticker list reached the engine but not the key, so one scoped request
  poisoned the cached day for every later one. Anything that only changes which rows are *shown*
  belongs in a filter applied after the cache, never in the build.
- **A strategy has rating classes.** The taxonomy varies (Arbitrage: session bands; OpenDoor: exit
  horizons) but the shape `class × direction → {rate, total}` does not. Do not model a strategy as
  having none.
- **Nothing may be derived from rows already on screen.** Both scanners once built their request
  ticker scope out of the rows they were displaying, which quietly scoped every request to the
  previous one's results.

## Backend side

A strategy also needs its paper endpoints. The substrate is `StrategyCommon/Paper/` —
`PaperFilters`, `PaperAnalytics`, `PaperThresholds`, `PaperDayRunner`, `PaperResponseCache` — plus
`TapeDayStore<TClosed, TState>` for the per-day cache. Inherit `PaperStrategyRequest` for the
request DTO so the shared filters apply to it unchanged, as `PaperOpenDoorRequest` does.
