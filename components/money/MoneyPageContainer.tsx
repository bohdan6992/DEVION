"use client";

import { useEffect, useMemo, useState } from "react";
import ArbitrageScanner from "../scanner/ArbitrageScanner";
import {
  deriveMoneyExecutionDescriptor,
  type MoneyAutomationConfig,
  type MoneyExecutionDescriptor,
  type MoneyRatingRule,
} from "./moneyEngine";

type MoneyTabKey = "active" | "episodes" | "analytics";
type MoneyRuleBand = "BLUE" | "ARK" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";
type MoneySession = "BLUE" | "ARK" | "OPEN" | "INTRA" | "POST" | "NIGHT" | "GLOB";

const MONEY_TAB_LS_KEY = "money.arbitrage.tab";
const MONEY_SESSION_LS_KEY = "money.arbitrage.session";
const MONEY_RULE_BAND_LS_KEY = "money.arbitrage.rule-band";
const MONEY_AUTOMATION_LS_KEY = "money.arbitrage.automation";

function ruleBandFromSession(session: MoneySession): MoneyRuleBand {
  switch (session) {
    case "BLUE":
      return "BLUE";
    case "ARK":
      return "ARK";
    case "OPEN":
      return "OPEN";
    case "INTRA":
      return "INTRA";
    case "POST":
      return "POST";
    case "NIGHT":
    case "GLOB":
    default:
      return "GLOBAL";
  }
}

function sessionFromRuleBand(band: MoneyRuleBand): MoneySession {
  switch (band) {
    case "BLUE":
      return "BLUE";
    case "ARK":
      return "ARK";
    case "OPEN":
      return "OPEN";
    case "INTRA":
      return "INTRA";
    case "POST":
      return "POST";
    case "PRINT":
    case "GLOBAL":
    default:
      return "GLOB";
  }
}

function defaultAutomationConfig(): MoneyAutomationConfig {
  return {
    strategyModeEnabled: false,
    minNetEdge: 0,
    endSignalThreshold: 0.1,
    maxOpenPositions: 20,
    maxAdds: 3,
    queueDelayMinSeconds: 0,
    queueDelayMaxSeconds: 0,
    exitExecutionMode: "active",
    hedgeMode: "unhedged",
    scaleMode: "scale_in",
    sizingMode: "USD",
    sizeValue: 30000,
    dilutionStep: 0.5,
    minHoldMinutes: 1,
    exitMode: "print",
    printStartTime: "09:20",
    printCloseTime: "09:20",
    noSpreadExit: true,
  };
}

function readInitialMoneyTab(): MoneyTabKey {
  if (typeof window === "undefined") return "active";
  try {
    const raw = window.localStorage.getItem(MONEY_TAB_LS_KEY);
    if (raw === "active" || raw === "episodes" || raw === "analytics") return raw;
  } catch {
    // ignore storage issues
  }
  return "active";
}

function readInitialMoneyRuleBand(): MoneyRuleBand {
  if (typeof window === "undefined") return "GLOBAL";
  try {
    const raw = window.localStorage.getItem(MONEY_RULE_BAND_LS_KEY);
    if (raw === "BLUE" || raw === "ARK" || raw === "OPEN" || raw === "INTRA" || raw === "PRINT" || raw === "POST" || raw === "GLOBAL") {
      return raw;
    }
  } catch {
    // ignore storage issues
  }
  return "GLOBAL";
}

function readInitialMoneySession(): MoneySession {
  if (typeof window === "undefined") return "GLOB";
  try {
    const raw = window.localStorage.getItem(MONEY_SESSION_LS_KEY);
    if (raw === "BLUE" || raw === "ARK" || raw === "OPEN" || raw === "INTRA" || raw === "POST" || raw === "NIGHT" || raw === "GLOB") {
      return raw;
    }
  } catch {
    // ignore storage issues
  }
  return "GLOB";
}

function readInitialAutomationConfig(): MoneyAutomationConfig {
  if (typeof window === "undefined") return defaultAutomationConfig();
  try {
    const raw = window.localStorage.getItem(MONEY_AUTOMATION_LS_KEY);
    if (!raw) return defaultAutomationConfig();
    const parsed = JSON.parse(raw) as Partial<MoneyAutomationConfig>;
    return {
      ...defaultAutomationConfig(),
      ...parsed,
      strategyModeEnabled: false,
      minNetEdge: Math.max(0, Number(parsed.minNetEdge) || 0),
      endSignalThreshold: Math.max(0, Number(parsed.endSignalThreshold) || defaultAutomationConfig().endSignalThreshold),
      maxOpenPositions: Math.max(1, Math.trunc(Number(parsed.maxOpenPositions) || defaultAutomationConfig().maxOpenPositions)),
      maxAdds: Math.max(0, Math.trunc(Number(parsed.maxAdds) || defaultAutomationConfig().maxAdds)),
      queueDelayMinSeconds: Math.max(0, Number(parsed.queueDelayMinSeconds) || 0),
      queueDelayMaxSeconds: Math.max(0, Number(parsed.queueDelayMaxSeconds) || 0),
      sizeValue: Math.max(1, Number(parsed.sizeValue) || defaultAutomationConfig().sizeValue),
      dilutionStep: Math.max(0.1, Number(parsed.dilutionStep) || defaultAutomationConfig().dilutionStep),
      minHoldMinutes: Math.max(0, Math.trunc(Number(parsed.minHoldMinutes) || defaultAutomationConfig().minHoldMinutes)),
      exitExecutionMode: parsed.exitExecutionMode === "passive" ? "passive" : "active",
      hedgeMode: parsed.hedgeMode === "hedged" ? "hedged" : "unhedged",
      scaleMode: parsed.scaleMode === "single" ? "single" : "scale_in",
      sizingMode: parsed.sizingMode === "TIER" ? "TIER" : "USD",
      exitMode: parsed.exitMode === "normalize" ? "normalize" : "print",
      printStartTime: typeof parsed.printStartTime === "string" && parsed.printStartTime ? parsed.printStartTime : defaultAutomationConfig().printStartTime,
      printCloseTime: typeof parsed.printCloseTime === "string" && parsed.printCloseTime ? parsed.printCloseTime : defaultAutomationConfig().printCloseTime,
      noSpreadExit: typeof parsed.noSpreadExit === "boolean" ? parsed.noSpreadExit : defaultAutomationConfig().noSpreadExit,
    };
  } catch {
    return defaultAutomationConfig();
  }
}

export default function MoneyPageContainer() {
  const [tab, setTab] = useState<MoneyTabKey>(readInitialMoneyTab);
  const [session, setSession] = useState<MoneySession>(readInitialMoneySession);
  const [automationConfig, setAutomationConfig] = useState<MoneyAutomationConfig>(readInitialAutomationConfig);
  const [sharedRatingRules, setSharedRatingRules] = useState<MoneyRatingRule[]>([
    { band: "BLUE", minRate: 0, minTotal: 0 },
    { band: "ARK", minRate: 0, minTotal: 0 },
    { band: "OPEN", minRate: 0, minTotal: 0 },
    { band: "INTRA", minRate: 0, minTotal: 0 },
    { band: "PRINT", minRate: 0, minTotal: 0 },
    { band: "POST", minRate: 0, minTotal: 0 },
    { band: "GLOBAL", minRate: 0, minTotal: 0 },
  ]);
  const [shellStats, setShellStats] = useState({
    signals: 0,
    ready: 0,
    open: 0,
    autoEnabled: true,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(MONEY_TAB_LS_KEY, tab);
    } catch {
      // ignore storage issues
    }
  }, [tab]);

  const ruleBand = useMemo(() => ruleBandFromSession(session), [session]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MONEY_SESSION_LS_KEY, session);
      window.localStorage.setItem(MONEY_RULE_BAND_LS_KEY, ruleBand);
    } catch {
      // ignore storage issues
    }
  }, [ruleBand, session]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MONEY_AUTOMATION_LS_KEY, JSON.stringify(automationConfig));
    } catch {
      // ignore storage issues
    }
  }, [automationConfig]);

  const headerBadgeValues = ["EXECUTION", "FILTERED", shellStats.autoEnabled ? "AUTO ON" : "AUTO OFF"];
  const headerMetaLabel = `signals ${shellStats.signals.toLocaleString("en-US")} | ready ${shellStats.ready.toLocaleString("en-US")} | open ${shellStats.open.toLocaleString("en-US")}`;
  const moneyExecutionDescriptor: MoneyExecutionDescriptor = useMemo(
    () => deriveMoneyExecutionDescriptor(ruleBand, sharedRatingRules),
    [ruleBand, sharedRatingRules]
  );

  return (
    <ArbitrageScanner
      initialPrimaryPanel="money"
      shellMode="moneyOnly"
      controlledTab={tab}
      onControlledTabChange={setTab}
      controlledSession={session}
      onControlledSessionChange={setSession}
      controlledRuleBand={ruleBand}
      onControlledRuleBandChange={(band) => setSession(sessionFromRuleBand(band as MoneyRuleBand))}
      moneyExecutionDescriptorOverride={moneyExecutionDescriptor}
      moneyAutomationConfigOverride={automationConfig}
      moneyAutoStartEnabledOverride={false}
      moneyViewModeOverride="money-auto-tab"
      onMoneyAutomationConfigChange={(patch) => setAutomationConfig((prev) => ({ ...prev, ...patch }))}
      headerTitleOverride="ARBITRAGE MONEY"
      headerBadgeValuesOverride={headerBadgeValues}
      headerMetaLabelOverride={headerMetaLabel}
      activeTabLabelOverride="CANDIDATES"
      episodesTabLabelOverride="POSITIONS"
      analyticsTabLabelOverride="AUTO"
      onMoneyShellStatsChange={setShellStats}
      onSharedRatingRulesChange={(rules) => setSharedRatingRules(rules)}
    />
  );
}
