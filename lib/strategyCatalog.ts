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
  { key: "reversal", name: "Reversal", icon: "🧭", description: "Розворот після екстремуму." },
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