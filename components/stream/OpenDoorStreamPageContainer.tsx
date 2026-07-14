"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridgeUrl } from "../../lib/bridgeBase";
import OpenDoorScanner from "../scanner/OpenDoorScanner";
import {
  deriveStreamExecutionDescriptor,
  type StreamAutomationConfig,
  type StreamExecutionDescriptor,
  type StreamRatingRule,
} from "./streamEngine";

type StreamTabKey = "active" | "episodes" | "analytics";
type StreamRuleBand = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";
type StreamSession = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "POST" | "NIGHT" | "GLOB";

const DEFAULT_LS_PREFIX = "stream.opendoor";
const STREAM_AUTOMATION_HEARTBEAT_INTERVAL_MS = 60000;

function createStreamPageClientId(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `stream-page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ruleBandFromSession(session: StreamSession): StreamRuleBand {
  switch (session) {
    case "BLUE":
      return "BLUE";
    case "ARK":
      return "ARK";
    case "PRE":
      return "PRE";
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

function sessionFromRuleBand(band: StreamRuleBand): StreamSession {
  switch (band) {
    case "BLUE":
      return "BLUE";
    case "ARK":
      return "ARK";
    case "PRE":
      return "PRE";
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

function defaultAutomationConfig(): StreamAutomationConfig {
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
    addDelayMinutes: 0,
    minHoldMinutes: 1,
    exitMode: "print",
    printStartTime: "09:20",
    printCloseTime: "09:20",
    noSpreadExit: true,
    exitConfirmTicks: 3,
    betaMode: false,
    startCutoffTime: "09:20",
    preStartTime: "21:00",
  };
}

function sameStreamAutomationConfig(
  left: StreamAutomationConfig,
  right: StreamAutomationConfig,
): boolean {
  return (
    left.strategyModeEnabled === right.strategyModeEnabled &&
    left.minNetEdge === right.minNetEdge &&
    left.endSignalThreshold === right.endSignalThreshold &&
    left.maxOpenPositions === right.maxOpenPositions &&
    left.maxAdds === right.maxAdds &&
    left.queueDelayMinSeconds === right.queueDelayMinSeconds &&
    left.queueDelayMaxSeconds === right.queueDelayMaxSeconds &&
    left.exitExecutionMode === right.exitExecutionMode &&
    left.hedgeMode === right.hedgeMode &&
    left.scaleMode === right.scaleMode &&
    left.sizingMode === right.sizingMode &&
    left.sizeValue === right.sizeValue &&
    left.dilutionStep === right.dilutionStep &&
    left.minHoldMinutes === right.minHoldMinutes &&
    left.exitMode === right.exitMode &&
    left.printStartTime === right.printStartTime &&
    left.printCloseTime === right.printCloseTime &&
    left.noSpreadExit === right.noSpreadExit &&
    left.betaMode === right.betaMode &&
    left.startCutoffTime === right.startCutoffTime &&
    left.preStartTime === right.preStartTime
  );
}

function sameShellStats(
  left: { signals: number; ready: number; open: number; autoEnabled: boolean },
  right: { signals: number; ready: number; open: number; autoEnabled: boolean },
): boolean {
  return (
    left.signals === right.signals &&
    left.ready === right.ready &&
    left.open === right.open &&
    left.autoEnabled === right.autoEnabled
  );
}

function sameSharedRatingRules(
  left: StreamRatingRule[],
  right: StreamRatingRule[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].band !== right[index].band ||
      left[index].minRate !== right[index].minRate ||
      left[index].minTotal !== right[index].minTotal
    ) {
      return false;
    }
  }
  return true;
}

function readInitialStreamTab(key: string): StreamTabKey {
  if (typeof window === "undefined") return "active";
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "active" || raw === "episodes" || raw === "analytics") return raw;
  } catch {
    // ignore storage issues
  }
  return "active";
}

function readInitialStreamRuleBand(key: string): StreamRuleBand {
  if (typeof window === "undefined") return "GLOBAL";
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "BLUE" || raw === "ARK" || raw === "PRE" || raw === "OPEN" || raw === "INTRA" || raw === "PRINT" || raw === "POST" || raw === "GLOBAL") {
      return raw;
    }
  } catch {
    // ignore storage issues
  }
  return "GLOBAL";
}

function readInitialStreamSession(key: string): StreamSession {
  if (typeof window === "undefined") return "GLOB";
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "BLUE" || raw === "ARK" || raw === "PRE" || raw === "OPEN" || raw === "INTRA" || raw === "POST" || raw === "NIGHT" || raw === "GLOB") {
      return raw;
    }
  } catch {
    // ignore storage issues
  }
  return "GLOB";
}

function readInitialAutomationConfig(automationKey: string): StreamAutomationConfig {
  if (typeof window === "undefined") return defaultAutomationConfig();
  try {
    const raw = window.localStorage.getItem(automationKey);
    if (!raw) return defaultAutomationConfig();
    const parsed = JSON.parse(raw) as Partial<StreamAutomationConfig>;
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
      addDelayMinutes: Math.max(0, Math.trunc(Number(parsed.addDelayMinutes) || 0)),
      minHoldMinutes: Math.max(0, Math.trunc(Number(parsed.minHoldMinutes) || defaultAutomationConfig().minHoldMinutes)),
      exitExecutionMode: parsed.exitExecutionMode === "passive" ? "passive" : "active",
      hedgeMode: parsed.hedgeMode === "hedged" ? "hedged" : "unhedged",
      scaleMode: parsed.scaleMode === "single" ? "single" : "scale_in",
      sizingMode: parsed.sizingMode === "TIER" ? "TIER" : "USD",
      exitMode: parsed.exitMode === "normalize" ? "normalize" : "print",
      printStartTime: typeof parsed.printStartTime === "string" && parsed.printStartTime ? parsed.printStartTime : defaultAutomationConfig().printStartTime,
      printCloseTime: typeof parsed.printCloseTime === "string" && parsed.printCloseTime ? parsed.printCloseTime : defaultAutomationConfig().printCloseTime,
      noSpreadExit: typeof parsed.noSpreadExit === "boolean" ? parsed.noSpreadExit : defaultAutomationConfig().noSpreadExit,
      betaMode: typeof parsed.betaMode === "boolean" ? parsed.betaMode : false,
      startCutoffTime: typeof parsed.startCutoffTime === "string" && parsed.startCutoffTime ? parsed.startCutoffTime : defaultAutomationConfig().startCutoffTime,
      preStartTime: typeof parsed.preStartTime === "string" && parsed.preStartTime ? parsed.preStartTime : defaultAutomationConfig().preStartTime,
    };
  } catch {
    return defaultAutomationConfig();
  }
}

type OpenDoorStreamPageContainerProps = {
  lsKeyPrefix?: string;
  headerTitle?: string;
  navStreamHref?: string;
  navScannerHref?: string;
  navSonarHref?: string;
};

// Parallel counterpart to StreamPageContainer.tsx (which wraps ArbitrageScanner) — this wraps
// OpenDoorScanner instead, so the OpenDoor stream tab gets its OWN UI (OpenDoorScanner's own
// toolbar, e.g. the 10m/30m exit-class buttons) while reusing the SAME underlying dispatch/
// execution logic (streamEngine.ts, imported identically here). Do not merge this back into
// StreamPageContainer.tsx — OpenDoor and Arbitrage must stay independently editable.
export default function OpenDoorStreamPageContainer({
  lsKeyPrefix = DEFAULT_LS_PREFIX,
  headerTitle,
  navStreamHref,
  navScannerHref,
  navSonarHref,
}: OpenDoorStreamPageContainerProps = {}) {
  const tabLsKey = `${lsKeyPrefix}.tab`;
  const sessionLsKey = `${lsKeyPrefix}.session`;
  const ruleBandLsKey = `${lsKeyPrefix}.rule-band`;
  const automationLsKey = `${lsKeyPrefix}.automation`;

  const [tab, setTab] = useState<StreamTabKey>(() => readInitialStreamTab(tabLsKey));
  const [session, setSession] = useState<StreamSession>(() => readInitialStreamSession(sessionLsKey));
  const [ruleBand, setRuleBand] = useState<StreamRuleBand>(() => readInitialStreamRuleBand(ruleBandLsKey));
  const [automationConfig, setAutomationConfig] = useState<StreamAutomationConfig>(() => readInitialAutomationConfig(automationLsKey));
  const [streamAutoEnabled, setStreamAutoEnabled] = useState(false);
  const [streamPageClientId] = useState(createStreamPageClientId);
  const remoteAutomationGuardUntilRef = useRef(0);
  const [sharedRatingRules, setSharedRatingRules] = useState<StreamRatingRule[]>([
    { band: "BLUE", minRate: 0, minTotal: 0 },
    { band: "ARK", minRate: 0, minTotal: 0 },
    { band: "PRE", minRate: 0, minTotal: 0 },
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

  useEffect(() => {
    try {
      window.localStorage.setItem(tabLsKey, tab);
    } catch {
      // ignore storage issues
    }
  }, [tab, tabLsKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sessionLsKey, session);
      window.localStorage.setItem(ruleBandLsKey, ruleBand);
    } catch {
      // ignore storage issues
    }
  }, [ruleBand, session, sessionLsKey, ruleBandLsKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(automationLsKey, JSON.stringify(automationConfig));
    } catch {
      // ignore storage issues
    }
  }, [automationConfig, automationLsKey]);

  const applyLocalAutoEnabled = useCallback((enabled: boolean) => {
    remoteAutomationGuardUntilRef.current = Date.now() + 4000;
    setStreamAutoEnabled(enabled);
  }, []);

  const applyLocalAutomationConfigPatch = useCallback((patch: Partial<StreamAutomationConfig>) => {
    remoteAutomationGuardUntilRef.current = Date.now() + 4000;
    setAutomationConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const pullRemoteState = useCallback(async () => {
    try {
      const response = await fetch(bridgeUrl("/api/stream/automation/state"), { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) return;
      const state = json?.state ?? {};
      const remoteAutoEnabled = Boolean(state.autoEnabled);
      const remoteStrategyModeEnabled = Boolean(state.strategyModeEnabled);
      const guarded = Date.now() < remoteAutomationGuardUntilRef.current;
      if (
        guarded &&
        (remoteAutoEnabled !== streamAutoEnabled || remoteStrategyModeEnabled !== automationConfig.strategyModeEnabled)
      ) {
        return;
      }
      setStreamAutoEnabled((prev) => (prev === remoteAutoEnabled ? prev : remoteAutoEnabled));
      setAutomationConfig((prev) => {
        const next = {
          ...prev,
          strategyModeEnabled: remoteStrategyModeEnabled,
        };
        return sameStreamAutomationConfig(prev, next) ? prev : next;
      });
    } catch {
      // keep local state if remote sync is unavailable
    }
  }, [automationConfig.strategyModeEnabled, streamAutoEnabled]);

  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch(bridgeUrl("/api/stream/automation/heartbeat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: streamPageClientId,
          source: "opendoor-stream-page",
        }),
      });
    } catch {
      // heartbeat is best-effort
    }
  }, [streamPageClientId]);

  useEffect(() => {
    let cancelled = false;
    const syncNow = async () => {
      await sendHeartbeat();
      if (!cancelled) {
        await pullRemoteState();
      }
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void syncNow();
      }
    };

    void syncNow();
    const heartbeatTimer = window.setInterval(() => {
      void sendHeartbeat();
    }, STREAM_AUTOMATION_HEARTBEAT_INTERVAL_MS);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [pullRemoteState, sendHeartbeat]);

  const headerBadgeValues = ["EXECUTION", "FILTERED", shellStats.autoEnabled ? "AUTO ON" : "AUTO OFF"];
  const headerMetaLabel = `signals ${shellStats.signals.toLocaleString("en-US")} | ready ${shellStats.ready.toLocaleString("en-US")} | open ${shellStats.open.toLocaleString("en-US")}`;
  const streamExecutionDescriptor: StreamExecutionDescriptor = useMemo(
    () => deriveStreamExecutionDescriptor(ruleBand, sharedRatingRules),
    [ruleBand, sharedRatingRules]
  );
  const handleStreamShellStatsChange = useCallback((stats: {
    signals: number;
    ready: number;
    open: number;
    autoEnabled: boolean;
  }) => {
    setShellStats((prev) => sameShellStats(prev, stats) ? prev : stats);
  }, []);
  const handleSharedRatingRulesChange = useCallback((rules: StreamRatingRule[]) => {
    setSharedRatingRules((prev) => sameSharedRatingRules(prev, rules) ? prev : rules);
  }, []);

  // SIMULATOR = episodes tab: always betaMode (no real orders).
  // EXECUTOR  = analytics tab: always real orders (betaMode forced off).
  const automationConfigForTab = useMemo<StreamAutomationConfig>(
    () => tab === "episodes"
      ? { ...automationConfig, betaMode: true }
      : { ...automationConfig, betaMode: false },
    [automationConfig, tab]
  );

  const handleControlledSessionChange = useCallback((nextSession: StreamSession) => {
    setSession(nextSession);
    setRuleBand(ruleBandFromSession(nextSession));
  }, []);

  const handleControlledRuleBandChange = useCallback((nextBand: StreamRuleBand) => {
    setRuleBand(nextBand);
    if (nextBand === "PRINT") {
      return;
    }
    setSession(sessionFromRuleBand(nextBand));
  }, []);

  return (
    <OpenDoorScanner
      initialPrimaryPanel="stream"
      shellMode="streamOnly"
      controlledTab={tab}
      onControlledTabChange={setTab}
      controlledSession={session}
      onControlledSessionChange={handleControlledSessionChange}
      controlledRuleBand={ruleBand}
      onControlledRuleBandChange={(band) => handleControlledRuleBandChange(band as StreamRuleBand)}
      streamExecutionDescriptorOverride={streamExecutionDescriptor}
      streamAutomationConfigOverride={automationConfigForTab}
      streamAutoStartEnabledOverride={false}
      streamAutoEnabledOverride={streamAutoEnabled}
      streamViewModeOverride="stream-auto-tab"
      onStreamAutomationConfigChange={applyLocalAutomationConfigPatch}
      onStreamAutoEnabledChange={applyLocalAutoEnabled}
      headerTitleOverride={headerTitle ?? "OPEN DOOR STREAM"}
      headerMinimal
      navStreamHref={navStreamHref}
      navScannerHref={navScannerHref}
      navSonarHref={navSonarHref}
      headerBadgeValuesOverride={headerBadgeValues}
      headerMetaLabelOverride={headerMetaLabel}
      activeTabLabelOverride="CONFIG"
      episodesTabLabelOverride="SIMULATOR"
      analyticsTabLabelOverride="EXECUTOR"
      onStreamShellStatsChange={handleStreamShellStatsChange}
      onSharedRatingRulesChange={handleSharedRatingRulesChange}
    />
  );
}
