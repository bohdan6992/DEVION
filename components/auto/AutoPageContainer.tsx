"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridgeUrl } from "../../lib/bridgeBase";
import { deriveStreamExecutionDescriptor, type StreamAutomationConfig, type StreamExecutionDescriptor, type StreamRatingRule } from "../stream/streamEngine";
import ArbitrageScanner from "../scanner/ArbitrageScanner";

type AutoTabKey = "active" | "episodes" | "analytics";
type AutoRuleBand = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";

const AUTO_TAB_LS_KEY = "auto.arbitrage.tab";
const AUTO_RULE_BAND_LS_KEY = "auto.arbitrage.rule-band";
const AUTO_AUTOMATION_LS_KEY = "auto.arbitrage.automation";
const LEGACY_STREAM_AUTOMATION_LS_KEY = "stream.arbitrage.automation";

function defaultAutomationConfig(): StreamAutomationConfig {
  return {
    strategyModeEnabled: true,
    minNetEdge: 0.05,
    endSignalThreshold: 0.25,
    maxOpenPositions: 20,
    maxAdds: 3,
    queueDelayMinSeconds: 0,
    queueDelayMaxSeconds: 0,
    exitExecutionMode: "active",
    hedgeMode: "hedged",
    scaleMode: "single",
    sizingMode: "USD",
    sizeValue: 1000,
    dilutionStep: 0.3,
    addDelayMinutes: 0,
    minHoldMinutes: 5,
    exitMode: "normalize",
    printStartTime: "09:20",
    printCloseTime: "09:30",
    noSpreadExit: true,
    exitConfirmTicks: 3,
    betaMode: false,
    startCutoffTime: "09:20",
  };
}

function readInitialAutoTab(): AutoTabKey {
  if (typeof window === "undefined") return "active";
  try {
    const raw = window.localStorage.getItem(AUTO_TAB_LS_KEY);
    if (raw === "active" || raw === "episodes" || raw === "analytics") return raw;
  } catch {
    // ignore storage issues
  }
  return "active";
}

function readInitialAutoRuleBand(): AutoRuleBand {
  if (typeof window === "undefined") return "GLOBAL";
  try {
    const raw = window.localStorage.getItem(AUTO_RULE_BAND_LS_KEY);
    if (raw === "BLUE" || raw === "ARK" || raw === "OPEN" || raw === "INTRA" || raw === "PRINT" || raw === "POST" || raw === "GLOBAL") {
      return raw;
    }
  } catch {
    // ignore storage issues
  }
  return "GLOBAL";
}

function readInitialAutomationConfig(): StreamAutomationConfig {
  if (typeof window === "undefined") return defaultAutomationConfig();
  try {
    const raw =
      window.localStorage.getItem(AUTO_AUTOMATION_LS_KEY) ??
      window.localStorage.getItem(LEGACY_STREAM_AUTOMATION_LS_KEY);
    if (!raw) return defaultAutomationConfig();
    const parsed = JSON.parse(raw) as Partial<StreamAutomationConfig>;
    return {
      ...defaultAutomationConfig(),
      ...parsed,
      strategyModeEnabled: parsed.strategyModeEnabled !== false,
      minNetEdge: Math.max(0, Number(parsed.minNetEdge) || defaultAutomationConfig().minNetEdge),
      endSignalThreshold: Math.max(0, Number(parsed.endSignalThreshold) || defaultAutomationConfig().endSignalThreshold),
      maxOpenPositions: Math.max(1, Math.trunc(Number(parsed.maxOpenPositions) || defaultAutomationConfig().maxOpenPositions)),
      maxAdds: Math.max(0, Math.trunc(Number(parsed.maxAdds) || defaultAutomationConfig().maxAdds)),
      queueDelayMinSeconds: Math.max(0, Number(parsed.queueDelayMinSeconds) || 0),
      queueDelayMaxSeconds: Math.max(0, Number(parsed.queueDelayMaxSeconds) || 0),
      sizeValue: Math.max(1, Number(parsed.sizeValue) || defaultAutomationConfig().sizeValue),
      dilutionStep: Math.max(0.1, Number(parsed.dilutionStep) || defaultAutomationConfig().dilutionStep),
      addDelayMinutes: Math.max(0, Math.trunc(Number(parsed.addDelayMinutes) || 0)),
      minHoldMinutes: Math.max(0, Math.trunc(Number(parsed.minHoldMinutes) || defaultAutomationConfig().minHoldMinutes)),
      exitExecutionMode: parsed.exitExecutionMode === "passive" ? "passive" : "active",
      hedgeMode: parsed.hedgeMode === "unhedged" ? "unhedged" : "hedged",
      scaleMode: parsed.scaleMode === "scale_in" ? "scale_in" : "single",
      sizingMode: parsed.sizingMode === "TIER" ? "TIER" : "USD",
      exitMode: parsed.exitMode === "print" ? "print" : "normalize",
      printStartTime: typeof parsed.printStartTime === "string" && parsed.printStartTime ? parsed.printStartTime : defaultAutomationConfig().printStartTime,
      printCloseTime: typeof parsed.printCloseTime === "string" && parsed.printCloseTime ? parsed.printCloseTime : defaultAutomationConfig().printCloseTime,
      noSpreadExit: typeof parsed.noSpreadExit === "boolean" ? parsed.noSpreadExit : defaultAutomationConfig().noSpreadExit,
      exitConfirmTicks: typeof parsed.exitConfirmTicks === "number" ? parsed.exitConfirmTicks : defaultAutomationConfig().exitConfirmTicks,
      betaMode: false,
      startCutoffTime: typeof parsed.startCutoffTime === "string" && parsed.startCutoffTime ? parsed.startCutoffTime : defaultAutomationConfig().startCutoffTime,
    };
  } catch {
    return defaultAutomationConfig();
  }
}

export default function AutoPageContainer() {
  const [tab, setTab] = useState<AutoTabKey>(readInitialAutoTab);
  const [ruleBand, setRuleBand] = useState<AutoRuleBand>(readInitialAutoRuleBand);
  const [automationConfig, setAutomationConfig] = useState<StreamAutomationConfig>(readInitialAutomationConfig);
  const [streamAutoEnabled, setStreamAutoEnabled] = useState(false);
  const localChangeGuardRef = useRef(0);
  const [sharedRatingRules, setSharedRatingRules] = useState<StreamRatingRule[]>([
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
    autoEnabled: false,
  });

  const applyLocalAutoEnabled = useCallback((enabled: boolean) => {
    localChangeGuardRef.current = Date.now() + 4000;
    setStreamAutoEnabled(enabled);
  }, []);

  const applyLocalAutomationConfigPatch = useCallback((patch: Partial<StreamAutomationConfig>) => {
    localChangeGuardRef.current = Date.now() + 4000;
    setAutomationConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pullRemoteState = async () => {
      try {
        const response = await fetch(bridgeUrl("/api/stream/automation/state"), { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || json?.ok === false) return;
        const state = json?.state ?? {};
        const remoteAutoEnabled = Boolean(state.autoEnabled);
        const remoteStrategyModeEnabled = Boolean(state.strategyModeEnabled);
        if (Date.now() < localChangeGuardRef.current) return;
        setStreamAutoEnabled((prev) => prev === remoteAutoEnabled ? prev : remoteAutoEnabled);
        setAutomationConfig((prev) => {
          const next = { ...prev, strategyModeEnabled: remoteStrategyModeEnabled };
          return prev.strategyModeEnabled === remoteStrategyModeEnabled ? prev : next;
        });
      } catch {
        // keep local state if remote sync is unavailable
      }
    };
    void pullRemoteState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_TAB_LS_KEY, tab);
    } catch {
      // ignore storage issues
    }
  }, [tab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_RULE_BAND_LS_KEY, ruleBand);
    } catch {
      // ignore storage issues
    }
  }, [ruleBand]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_AUTOMATION_LS_KEY, JSON.stringify(automationConfig));
    } catch {
      // ignore storage issues
    }
  }, [automationConfig]);

  const headerBadgeValues = ["AUTOMATION", "SONAR", shellStats.autoEnabled ? "AUTO ON" : "AUTO OFF"];
  const headerMetaLabel = `signals ${shellStats.signals.toLocaleString("en-US")} | ready ${shellStats.ready.toLocaleString("en-US")} | open ${shellStats.open.toLocaleString("en-US")}`;
  const streamExecutionDescriptor: StreamExecutionDescriptor = useMemo(
    () => deriveStreamExecutionDescriptor(ruleBand, sharedRatingRules),
    [ruleBand, sharedRatingRules]
  );

  return (
    <ArbitrageScanner
      initialPrimaryPanel="stream"
      shellMode="streamOnly"
      controlledTab={tab}
      onControlledTabChange={setTab}
      controlledRuleBand={ruleBand}
      onControlledRuleBandChange={setRuleBand}
      streamExecutionDescriptorOverride={streamExecutionDescriptor}
      streamAutomationConfigOverride={automationConfig}
      streamAutoEnabledOverride={streamAutoEnabled}
      streamAutoStartEnabledOverride={true}
      streamViewModeOverride="auto"
      onStreamAutomationConfigChange={applyLocalAutomationConfigPatch}
      onStreamAutoEnabledChange={applyLocalAutoEnabled}
      headerTitleOverride="ARBITRAGE AUTO"
      headerBadgeValuesOverride={headerBadgeValues}
      headerMetaLabelOverride={headerMetaLabel}
      activeTabLabelOverride="WINDOW"
      episodesTabLabelOverride="BOOK"
      analyticsTabLabelOverride="ACTIVE"
      onStreamShellStatsChange={setShellStats}
      onSharedRatingRulesChange={(rules) => setSharedRatingRules(rules)}
    />
  );
}
