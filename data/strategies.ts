// data/strategies.ts

export type StrategyInfo = {
  id: string;
  title: string;
  icon?: string;
  description: string;
};

export const STRATEGIES: StrategyInfo[] = [
  {
    id: "breakout",
    title: "Breakout",
    icon: "📈",
    description: "Пошук пробоїв рівнів та імпульсних рухів.",
  },
  {
    id: "pumpAndDump",
    title: "Pump & Dump",
    icon: "🚀",
    description: "Відлов різких накачок ціни та наступних зливів.",
  },
  {
    id: "reversal",
    title: "Reversal",
    icon: "🧭",
    description: "Розвороти після екстремальних рухів.",
  },
  {
    id: "earnings",
    title: "Earnings",
    icon: "🧳",
    description: "Торговля навколо квартальних звітів компаній.",
  },
  {
    id: "gap",
    title: "Gap Play",
    icon: "⛳️",
    description: "Гра на основі гепів відкриття.",
  },
  {
    id: "pullback",
    title: "Pullback",
    icon: "🪝",
    description: "Відкати після імпульсів у тренді.",
  },
  {
    id: "vwapBounce",
    title: "VWAP Bounce",
    icon: "〰️",
    description: "Відскоки від VWAP під час сесії.",
  },

  // --- Нові стратегії ---

  {
    id: "uptickRule",
    title: "Uptick Rule",
    icon: "🛡️",
    description: "Рухи після активації правила Uptick (–10%).",
  },
  {
    id: "quartalDep",
    title: "Quartal Dep",
    icon: "📅",
    description: "Квартальні залежності руху ціни.",
  },
  {
    id: "dayTwo",
    title: "Day Two",
    icon: "2️⃣",
    description: "Торгівля на другий день після сильного руху.",
  },
  {
    id: "arbitrage",
    title: "ArbitRage",
    icon: "🧮",
    description: "Стак–бенч арбітраж через β, σ і dev-моделі.",
  },

  // 🔥 ChronoFlow (наш хроно)
  {
    id: "chrono",
    title: "ChronoFlow",
    icon: "⏱️",
    description: "Вікна часу й нормалізація девіацій по ChronoFlow-моделі.",
  },

  {
    id: "opendoor",
    title: "Open Door",
    icon: "🚪",
    description: "Патерни після першого імпульсу на відкритті.",
  },
  {
    id: "rLine",
    title: "R-Line",
    icon: "📏",
    description: "Робота з рівнями R-зони та їх пробоями.",
  },
  {
    id: "intraDance",
    title: "Intra Dance",
    icon: "🩰",
    description: "Патерни динаміки ціни всередині дня.",
  },
  {
    id: "morningLounch",
    title: "Morning Lounch",
    icon: "🌅",
    description: "Ранкові імпульси після відкриття ринку.",
  },
  {
    id: "coupleDating",
    title: "Couple Dating",
    icon: "💞",
    description: "Парні залежності між інструментами.",
  },
  {
    id: "volumeArrival",
    title: "Volume Arrival",
    icon: "📊",
    description: "Стратегія по раптових сплесках обʼєму.",
  },
  {
    id: "latePrint",
    title: "Late Print",
    icon: "🕯️",
    description: "Пізні принти та запізнілі рухи на малих таймфреймах.",
  },
];
