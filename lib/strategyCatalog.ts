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
  { key: "earnings", name: "Earnings", icon: "🧳", description: "Рухи навколо звітності та пост-ефект." },
  { key: "gap", name: "Gap Play", icon: "⛳️", description: "Гепи та їх відпрацювання." },
  { key: "pullback", name: "Pullback", icon: "🪝", description: "Відкат у тренді для заходу." },
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
  { key: "morningLounch", name: "Morning Launch", icon: "🌅", description: "Ранковий імпульс після відкриття." },
  { key: "coupleDating", name: "Couple Dating", icon: "💞", description: "Парні залежності (SPY/QQQ тощо)." },
  { key: "volumeArrival", name: "Volume Arrival", icon: "📊", description: "Аномальний об’єм як тригер." },
  { key: "latePrint", name: "Late Print", icon: "🕯️", description: "Пізні принти та поведінка ціни." },
  { key: "chrono", name: "ChronoFlow", icon: "⏳", description: "Таймінг-потоки та хронологічні патерни." },
  { key: "powerHour", name: "Power Hour", icon: "⚡️", description: "Фінальна година сесії: сплеск волатильності та закриття позицій." },
];

export const STRATEGY_BY_KEY = Object.fromEntries(
  STRATEGY_CATALOG.map((s) => [s.key, s])
) as Record<string, StrategyMeta>;