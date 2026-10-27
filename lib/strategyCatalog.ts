// lib/strategyCatalog.ts

export type StrategyMeta = {
  key: string;
  name: string;
  description: string;
  icon?: string | null;
};

export const STRATEGY_CATALOG: StrategyMeta[] = [
  { key: "arbitrage", name: "ArbitRage", icon: "🧮", description: "Арбітражні вікна та повернення до норми." },
  { key: "pumpAndDump", name: "Pump & Dump", icon: "🚀", description: "Імпульсний зліт і різкий злив." },
  { key: "breakout", name: "Breakout", icon: "📈", description: "Пробій рівня та продовження руху." },
  // Display name only (2026-10-01, the operator's own instruction) — key/bridgeStrategyId/hotkeys/
  // routes/storage are all UNCHANGED ("reversal"/"stream.reversal" etc throughout), only the label
  // shown in the UI picked up the CLO• prefix (CLO = enters at the CLOSE, distinguishing this family
  // from OPG•Reversal/OPG•Continuum, which enter at the OPEN).
  { key: "reversal", name: "CLO•Reversal", icon: "🧭", description: "Розворот після екстремуму (вхід по клоузу)." },
  { key: "continuum", name: "CLO•Continuum", icon: "🌊", description: "Продовження руху після екстремуму (вхід по клоузу)." },
  { key: "opgReversal", name: "OPG•Reversal", icon: "🔔", description: "Розворот навколо відкриття ринку, вхід по ціні оупена." },
  { key: "opgContinuum", name: "OPG•Continuum", icon: "🌊", description: "Продовження руху навколо відкриття ринку, вхід по ціні оупена." },
  { key: "opgFade", name: "OPG•Fade", icon: "🌅", description: "Фейд відхилення від бенчмарку (ZAP%) навколо відкриття ринку, вхід по ціні оупена." },
  { key: "opgRide", name: "OPG•Ride", icon: "🏄", description: "Проїзд відхилення від бенчмарку (ZAP%) навколо відкриття ринку, вхід по ціні оупена." },
  { key: "earnings", name: "Earnings", icon: "🧳", description: "Рухи навколо звітності та пост-ефект." },
  { key: "gap", name: "Gap Play", icon: "⛳️", description: "Гепи та їх відпрацювання." },
  { key: "pullback", name: "PullBack", icon: "🪝", description: "Стак, що стоїть задалеко від вчорашнього закриття, розвертаємо о 4:30/5:00/5:30, вихід гепом." },
  { key: "vwapBounce", name: "VWAP Bounce", icon: "〰️", description: "Реакція ціни на VWAP." },
  { key: "uptickRule", name: "Uptick Rule", icon: "🛡️", description: "Падіння 10%+ і поведінка після правила." },
  { key: "quartalDep", name: "Quartal Dep", icon: "📅", description: "Квартальні залежності й події." },
  { key: "dayTwo", name: "Day Two", icon: "2️⃣", description: "Другий день після події." },
  { key: "opendoor", name: "Open Door", icon: "🚪", description: "Відкриття ринку: сетапи та статистика." },
  { key: "openfade", name: "Open Fade", icon: "🪞", description: "Фейд відхилення стака в сігмах на відкритті." },
  { key: "openride", name: "Open Ride", icon: "🏄", description: "Те саме відхилення, але за рухом: мінус — сел, плюс — бай." },
  { key: "pairflux", name: "PairFlux", icon: "⚖️", description: "Пари, що ходять разом: торгівля розходження спреду та його зведення." },
  { key: "rLine", name: "R-Line", icon: "📏", description: "Рівні ризику/нагороди та відпрацювання." },
  { key: "intraDance", name: "Intra Dance", icon: "🩰", description: "Інтра-динаміка: рух/нормалізація." },
  // Key was "morningLounch" (a placeholder, never wired to anything) until 2026-10-17; renamed to
  // "morLaunch" so it lowercases to the registry/bridge key "morlaunch" the way every other live
  // strategy's does (see lib/caesar/schedule.ts's own note on that convention).
  { key: "morLaunch", name: "Morning Launch", icon: "🌅", description: "Різкий рух 03:50-04:20 беремо в протилежну сторону, вихід гепом на 9:30." },
  // Evening twin of the entry above (operator, 2026-10-24): the same Sonar with the clock moved to 15:50-16:20. Sonar only so
  // far - no scanner/stream/server strategy. Key lowercases to the registry/bridge key "launchevening".
  { key: "launchEvening", name: "Evening Launch", icon: "🌆", description: "Різкий рух 15:50-16:20 беремо в протилежну сторону. Поки що лише Sonar." },
  // A second, unrelated way to run Morning Launch's thesis (operator's own, 2026-10-20): no tape,
  // no signal — a scheduled keystroke macro against TradingApp's own Basket feature (03:58 places
  // resting limits on everything in the basket, 04:01 cancels what's left — MOVED from 04:02,
  // 2026-10-25). A fill is never auto-exited; the card exists purely to show its own P&L. See
  // MorLaunchBasketServerStrategy.cs's own header comment on the bridge for the full spec.
  { key: "morLaunchBasket", name: "Launch•Morning", icon: "🧺", description: "Лімітки на весь баскет о 3:58, скасування о 4:01 — ловимо різкий рух 3:59-4:00. Вихід ручний." },
  // The evening twin of the entry above (operator's own, 2026-10-24): the same basket macro, only the
  // clock moves to the 16:00 transition (15:58 limits, 16:02 Ctrl+Q cancel). Key lowercases to the
  // registry/bridge key "launcheveningbasket". See LaunchEveningBasketServerStrategy.cs.
  { key: "launchEveningBasket", name: "Launch•Evening", icon: "🌇", description: "Лімітки на весь баскет о 15:58, скасування о 16:02 — ловимо різкий рух 15:59-16:00. Вихід ручний." },
  // New strategy (operator, 2026-10-27): weekday signal is the SAME filtered universe mechanism
  // every LAUNCH-family member uses, but the per-ticker rating is read straight off Arbitrage's own
  // published file under its PRE class (LimiterSonarLiveParamsService/LimiterSonarSnapshotService),
  // not a strategy-of-its-own notebook file. Sonar only so far — no entry/exit logic defined yet, so
  // Scanner/Stream have no backtest or live dispatch behind them. Key lowercases to the registry/
  // bridge key "limiter".
  { key: "limiter", name: "Limiter", icon: "🚧", description: "Список тікерів, відфільтрований як у LAUNCH-групі; рейтинг — PRE-клас з файлу арбітража. Поки що лише Sonar." },
  { key: "coupleDating", name: "Couple Dating", icon: "💞", description: "Парні залежності (SPY/QQQ тощо)." },
  { key: "volumeArrival", name: "Volume Arrival", icon: "📊", description: "Аномальний об’єм як тригер." },
  { key: "latePrint", name: "Late Print", icon: "🕯️", description: "Пізні принти та поведінка ціни." },
  { key: "chrono", name: "ChronoFlow", icon: "⏳", description: "Таймінг-потоки та хронологічні патерни." },
  { key: "powerHour", name: "Power Hour", icon: "⚡️", description: "Фінальна година сесії: сплеск волатильності та закриття позицій." },
];

export const STRATEGY_BY_KEY = Object.fromEntries(
  STRATEGY_CATALOG.map((s) => [s.key, s])
) as Record<string, StrategyMeta>;