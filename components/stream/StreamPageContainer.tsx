"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bridgeUrl, fetchWithTimeout } from "../../lib/bridgeBase";
import { StreamInstanceProvider, useStreamInstance } from "./streamInstance";
import {
  deriveStreamExecutionDescriptor,
  type StreamAutomationConfig,
  type StreamExecutionDescriptor,
  type StreamRatingRule,
} from "./streamEngine";

type StreamTabKey = "active" | "episodes" | "analytics";
type StreamRuleBand = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "PRINT" | "POST" | "GLOBAL";
type StreamSession = "BLUE" | "ARK" | "PRE" | "OPEN" | "INTRA" | "POST" | "NIGHT" | "GLOB";

const DEFAULT_LS_PREFIX = "stream.arbitrage";
// The bridge marks a UI host disconnected after 20s. Keep a safety margin so a Caesar-hosted
// browser engine remains connected between polls, even if one interval is delayed.
const STREAM_AUTOMATION_HEARTBEAT_INTERVAL_MS = 10000;
/**
 * How often the tab re-reads the bridge's automation flags.
 *
 * WHY THIS EXISTS. `strategyModeEnabled` is forced false on every mount and `streamAutoEnabled`
 * starts false, so the ONLY way this tab ever starts dispatching is `pullRemoteState` finding the
 * bridge's flags on. Until now that ran on mount, focus and visibilitychange and nowhere else —
 * which is fine for a tab someone just opened, and wrong for the one case Caesar exists to serve:
 * a tab left open all day while `CaesarPlanService` flips strategies on and off at segment edges
 * (its own timer ticks every 15s). A background tab gets no focus event, so the schedule started
 * ARBITRAGE at 10:00 and the engine sitting right there never found out.
 *
 * It cuts BOTH ways, and the stop direction is the safety-critical one: a per-strategy
 * `Stop("caesar-schedule")` does not raise queue panic-off — only the operator's all-strategies
 * stop does — so before this, a segment ending did not stop a tab that was already running either.
 *
 * Safe against clobbering an operator: every local toggle POSTs to the bridge BEFORE it touches
 * local state (see the scanner header's start/stop), so remote and local already agree by the time
 * a poll lands, and `remoteAutomationGuardUntilRef` covers the 4s in-flight window regardless.
 *
 * 10s against the schedule's 15s: worst case is ~25s from a segment boundary to the engine
 * running, and the poll is a single tiny GET.
 */
const STREAM_AUTOMATION_STATE_POLL_MS = 10000;

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

function defaultAutomationConfig(overrides?: Partial<StreamAutomationConfig>): StreamAutomationConfig {
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
    betaMode: false,
    startCutoffTime: "09:20",
    preStartTime: "21:00",
    // Applied LAST so a strategy can move a default, and applied to the DEFAULTS rather than to the
    // restored config, so it never overrules something the user has actually set.
    ...(overrides ?? {}),
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

function readInitialStreamRuleBand(
  key: string,
  fallback: StreamRuleBand = "GLOBAL",
  allowed?: readonly StreamRuleBand[],
): StreamRuleBand {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "BLUE" || raw === "ARK" || raw === "PRE" || raw === "OPEN" || raw === "INTRA" || raw === "PRINT" || raw === "POST" || raw === "GLOBAL") {
      // A band this strategy does not have is not a preference worth restoring. It would gate on a
      // rating row that can never match, which reads on screen as "the gate is set" and behaves as
      // "there is no gate at all".
      if (!allowed || allowed.includes(raw)) return raw;
    }
  } catch {
    // ignore storage issues
  }
  return fallback;
}

function readInitialStreamSession(
  key: string,
  fallback: StreamSession = "GLOB",
  allowed?: readonly StreamSession[],
): StreamSession {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "BLUE" || raw === "ARK" || raw === "PRE" || raw === "OPEN" || raw === "INTRA" || raw === "POST" || raw === "NIGHT" || raw === "GLOB") {
      if (!allowed || allowed.includes(raw)) return raw;
    }
  } catch {
    // ignore storage issues
  }
  return fallback;
}

function readInitialAutomationConfig(
  automationKey: string,
  overrides?: Partial<StreamAutomationConfig>,
): StreamAutomationConfig {
  if (typeof window === "undefined") return defaultAutomationConfig(overrides);
  try {
    const raw = window.localStorage.getItem(automationKey);
    if (!raw) return defaultAutomationConfig(overrides);
    const parsed = JSON.parse(raw) as Partial<StreamAutomationConfig>;
    return {
      ...defaultAutomationConfig(overrides),
      ...parsed,
      strategyModeEnabled: false,
      minNetEdge: Math.max(0, Number(parsed.minNetEdge) || 0),
      endSignalThreshold: Math.max(0, Number(parsed.endSignalThreshold) || defaultAutomationConfig(overrides).endSignalThreshold),
      maxOpenPositions: Math.max(1, Math.trunc(Number(parsed.maxOpenPositions) || defaultAutomationConfig(overrides).maxOpenPositions)),
      maxAdds: Math.max(0, Math.trunc(Number(parsed.maxAdds) || defaultAutomationConfig(overrides).maxAdds)),
      queueDelayMinSeconds: Math.max(0, Number(parsed.queueDelayMinSeconds) || 0),
      queueDelayMaxSeconds: Math.max(0, Number(parsed.queueDelayMaxSeconds) || 0),
      sizeValue: Math.max(1, Number(parsed.sizeValue) || defaultAutomationConfig(overrides).sizeValue),
      dilutionStep: Math.max(0.1, Number(parsed.dilutionStep) || defaultAutomationConfig(overrides).dilutionStep),
      addDelayMinutes: Math.max(0, Math.trunc(Number(parsed.addDelayMinutes) || 0)),
      minHoldMinutes: Math.max(0, Math.trunc(Number(parsed.minHoldMinutes) || defaultAutomationConfig(overrides).minHoldMinutes)),
      exitExecutionMode: parsed.exitExecutionMode === "passive" ? "passive" : "active",
      hedgeMode: parsed.hedgeMode === "hedged" ? "hedged" : "unhedged",
      scaleMode: parsed.scaleMode === "single" ? "single" : "scale_in",
      sizingMode: parsed.sizingMode === "TIER" ? "TIER" : "USD",
      exitMode: parsed.exitMode === "normalize" ? "normalize" : "print",
      printStartTime: typeof parsed.printStartTime === "string" && parsed.printStartTime ? parsed.printStartTime : defaultAutomationConfig(overrides).printStartTime,
      printCloseTime: typeof parsed.printCloseTime === "string" && parsed.printCloseTime ? parsed.printCloseTime : defaultAutomationConfig(overrides).printCloseTime,
      noSpreadExit: typeof parsed.noSpreadExit === "boolean" ? parsed.noSpreadExit : defaultAutomationConfig(overrides).noSpreadExit,
      betaMode: typeof parsed.betaMode === "boolean" ? parsed.betaMode : false,
      startCutoffTime: typeof parsed.startCutoffTime === "string" && parsed.startCutoffTime ? parsed.startCutoffTime : defaultAutomationConfig(overrides).startCutoffTime,
      preStartTime: typeof parsed.preStartTime === "string" && parsed.preStartTime ? parsed.preStartTime : defaultAutomationConfig(overrides).preStartTime,
    };
  } catch {
    return defaultAutomationConfig(overrides);
  }
}

type StreamPageContainerProps = {
  /**
   * Which scanner drives the stream tab.
   *
   * The shell, the dispatch and the execution logic are shared; the RULE is not. PairFlux picks
   * its trades on a pair's spread and rates them in its own three class windows, so it needs its
   * own toolbar and its own endpoints — a parameter rather than a third copy of this container.
   * Required, and the container imports no scanner of its own: a default would have pulled the
   * whole Arbitrage scanner into every strategy's bundle to serve as a value nobody renders.
   */
  ScannerComponent: React.ComponentType<any>;
  /**
   * The class windows this strategy actually has, and where it starts.
   *
   * Arbitrage spans eight bands and opens on GLOB. A strategy with three windows opening on GLOB
   * would ask the bridge for a class it does not define — which resolves to a fallback server-side
   * and matches no rating row, so the screen shows a gate that is not gating.
   */
  allowedSessions?: readonly StreamSession[];
  defaultSession?: StreamSession;
  /** Starting values for the automation panel, before anything the user has saved. */
  automationDefaults?: Partial<StreamAutomationConfig>;
  lsKeyPrefix?: string;
  headerTitle?: string;
  navStreamHref?: string;
  navScannerHref?: string;
  navSonarHref?: string;
  /**
   * Identity of this strategy instance. Defaults to lsKeyPrefix so an unconfigured mount keeps
   * its historical storage namespace. Give each parallel strategy a DISTINCT id — everything
   * the engine owns (stores, action log, bridge ticker leases) is keyed by it.
   */
  instanceId?: string;
  /**
   * Arbitration priority — HIGHER WINS. When two strategies want the same ticker at the same
   * minute boundary, the bridge grants it to the higher number and the other one skips that
   * entry. Leave distinct across strategies, or the tie falls back to whoever claimed first.
   */
  strategyPriority?: number;
  strategyLabel?: string;
  /**
   * When Caesar hosts this browser engine, its plan is the authority for the entry window.
   * This is deliberately an in-memory override: visiting the standalone Stream page keeps the
   * operator's saved CUTOFF unchanged.
   */
  caesarEntryStopTime?: string;
};

function StreamPageContainerInner({
  lsKeyPrefix = DEFAULT_LS_PREFIX,
  headerTitle,
  navStreamHref,
  navScannerHref,
  navSonarHref,
  ScannerComponent,
  allowedSessions,
  defaultSession = "GLOB",
  automationDefaults,
  caesarEntryStopTime,
}: StreamPageContainerProps) {
  const tabLsKey = `${lsKeyPrefix}.tab`;
  const sessionLsKey = `${lsKeyPrefix}.session`;
  const ruleBandLsKey = `${lsKeyPrefix}.rule-band`;
  const automationLsKey = `${lsKeyPrefix}.automation`;
  // Automation state on the bridge is per strategy. Without sending our own id every
  // instance would read and write ONE shared flag, so starting this strategy would switch
  // on every other one within a few seconds (this state is pulled on mount and on focus).
  const { strategyId } = useStreamInstance();

  const [tab, setTab] = useState<StreamTabKey>(() => readInitialStreamTab(tabLsKey));
  const [session, setSession] = useState<StreamSession>(() => readInitialStreamSession(sessionLsKey, defaultSession, allowedSessions));
  const [ruleBand, setRuleBand] = useState<StreamRuleBand>(() => readInitialStreamRuleBand(ruleBandLsKey, ruleBandFromSession(defaultSession), allowedSessions?.map(ruleBandFromSession)));
  const [automationConfig, setAutomationConfig] = useState<StreamAutomationConfig>(() => readInitialAutomationConfig(automationLsKey, automationDefaults));
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

  // See fetchWithTimeout's doc comment — an untimed poll on a setInterval that does not wait for
  // its own previous call stacks new fetches on top of stuck ones until Chrome refuses every
  // request on the tab with ERR_INSUFFICIENT_RESOURCES (measured live 2026-09-09).
  const pullStateInFlightRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);

  const pullRemoteState = useCallback(async () => {
    if (pullStateInFlightRef.current) return;
    pullStateInFlightRef.current = true;
    try {
      const response = await fetchWithTimeout(bridgeUrl(`/api/stream/automation/state?strategyId=${encodeURIComponent(strategyId)}`), { cache: "no-store" });
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
      setStreamAutoEnabled((prev) => {
        if (prev === remoteAutoEnabled) return prev;
        // Visible without needing the stream-gate-debug filter — this is a silent kill-switch
        // if it fires unexpectedly (e.g. remote/server lost its "enabled" state after a backend
        // restart, and this pullRemoteState call — triggered by mount or the tab regaining
        // focus/visibility — just turned local automation off to match).
        // eslint-disable-next-line no-console
        console.warn(`[stream-remote-sync] streamAutoEnabled ${prev} -> ${remoteAutoEnabled} (remote state overwrote local)`, {
          at: new Date().toISOString(),
          strategyId,
          source: document.visibilityState === "visible" ? "focus/visibility/mount" : "background",
        });
        return remoteAutoEnabled;
      });
      setAutomationConfig((prev) => {
        const next = {
          ...prev,
          strategyModeEnabled: remoteStrategyModeEnabled,
        };
        if (prev.strategyModeEnabled !== remoteStrategyModeEnabled) {
          // eslint-disable-next-line no-console
          console.warn(`[stream-remote-sync] strategyModeEnabled ${prev.strategyModeEnabled} -> ${remoteStrategyModeEnabled} (remote state overwrote local)`, {
            at: new Date().toISOString(),
            strategyId,
          });
        }
        return sameStreamAutomationConfig(prev, next) ? prev : next;
      });
    } catch {
      // keep local state if remote sync is unavailable
    } finally {
      pullStateInFlightRef.current = false;
    }
  }, [automationConfig.strategyModeEnabled, streamAutoEnabled, strategyId]);

  const sendHeartbeat = useCallback(async () => {
    if (heartbeatInFlightRef.current) return;
    heartbeatInFlightRef.current = true;
    try {
      await fetchWithTimeout(bridgeUrl("/api/stream/automation/heartbeat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: streamPageClientId,
          source: "stream-page",
          strategyId,
        }),
      });
    } catch {
      // heartbeat is best-effort
    } finally {
      heartbeatInFlightRef.current = false;
    }
  }, [streamPageClientId, strategyId]);

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

    // Caesar mounts Arbitrage and PairFlux at the same moment, so their two copies of this effect
    // fire `syncNow()` in the same tick by default — a burst of simultaneous requests fighting for
    // the same handful of HTTP/1.1 connections a persistent SSE feed per strategy already narrows
    // (see fetchWithTimeout's doc comment). A small deterministic-per-strategy delay spreads that
    // burst out instead of concentrating it; stable across remounts (hash of strategyId, not
    // Math.random()) so behaviour stays reproducible between runs.
    let hash = 0;
    for (let i = 0; i < strategyId.length; i++) hash = (hash * 31 + strategyId.charCodeAt(i)) | 0;
    const jitterMs = Math.abs(hash) % 1500;

    const startTimer = window.setTimeout(() => {
      void syncNow();
    }, jitterMs);
    let heartbeatTimer: number | null = null;
    let stateTimer: number | null = null;
    const armTimer = window.setTimeout(() => {
      heartbeatTimer = window.setInterval(() => {
        void sendHeartbeat();
      }, STREAM_AUTOMATION_HEARTBEAT_INTERVAL_MS);
      // The schedule moves without anyone touching this tab. See STREAM_AUTOMATION_STATE_POLL_MS.
      stateTimer = window.setInterval(() => {
        if (cancelled) return;
        void pullRemoteState();
      }, STREAM_AUTOMATION_STATE_POLL_MS);
    }, jitterMs);

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(armTimer);
      if (heartbeatTimer != null) window.clearInterval(heartbeatTimer);
      if (stateTimer != null) window.clearInterval(stateTimer);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [pullRemoteState, sendHeartbeat, strategyId]);

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
    () => ({
      ...automationConfig,
      betaMode: tab === "episodes",
      // Caesar has already decided whether this strategy is allowed to run. Its segment end must
      // therefore supersede an old standalone Stream cutoff (Arbitrage commonly persists 09:20),
      // otherwise an active INTRA engine can produce READY signals forever without queuing orders.
      ...(caesarEntryStopTime
        ? { startCutoffTime: caesarEntryStopTime, entryStopTime: caesarEntryStopTime }
        : {}),
    }),
    [automationConfig, caesarEntryStopTime, tab]
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
    <ScannerComponent
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
      headerTitleOverride={headerTitle ?? "ARBITRAGE STREAM"}
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

// The provider must sit ABOVE the component that reads instance-scoped stores, so it is a
// separate wrapper rather than something rendered inside StreamPageContainerInner. Everything
// below it (scanner, view, engine) resolves its stores and bridge identity from this context —
// which is what lets several of these run side by side without sharing state.
export default function StreamPageContainer(props: StreamPageContainerProps) {
  const lsKeyPrefix = props.lsKeyPrefix ?? DEFAULT_LS_PREFIX;
  const instanceId = props.instanceId ?? lsKeyPrefix;
  return (
    <StreamInstanceProvider
      instanceId={instanceId}
      strategyId={instanceId}
      label={props.strategyLabel ?? props.headerTitle ?? "ARBITRAGE STREAM"}
      priority={props.strategyPriority ?? 0}
      lsPrefix={lsKeyPrefix}
    >
      <StreamPageContainerInner {...props} />
    </StreamInstanceProvider>
  );
}
