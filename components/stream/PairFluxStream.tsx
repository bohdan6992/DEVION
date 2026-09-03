"use client";

import PairFluxScanner from "../scanner/PairFluxScanner";
import StreamPageContainer from "./StreamPageContainer";

type PairFluxStreamProps = {
  /** Distinct identity per parallel strategy. */
  instanceId?: string;
  /** Arbitration priority — HIGHER WINS when two strategies want the same ticker. */
  strategyPriority?: number;
  strategyLabel?: string;
  lsKeyPrefix?: string;
  headerTitle?: string;
};

/**
 * The stream SHELL is shared with Arbitrage; the RULE inside it is not.
 *
 * This used to render StreamPageContainer with its defaults, which meant the PairFlux stream tab
 * was the ARBITRAGE scanner: Arbitrage's toolbar, Arbitrage's eight rating bands, Arbitrage's
 * endpoints. Two things were wrong with that beyond the wrong controls — the session opened on
 * GLOB, a class PairFlux does not define, and the rating gate looked for a band that never
 * matches, so it silently did nothing.
 *
 * What is passed here is the whole difference: this strategy's scanner, its three class windows,
 * and the thresholds its engine actually defaults to.
 */
export default function PairFluxStream(props: PairFluxStreamProps = {}) {
  return (
    <StreamPageContainer
      {...props}
      ScannerComponent={PairFluxScanner}
      allowedSessions={PAIRFLUX_SESSIONS}
      defaultSession="OPEN"
      automationDefaults={PAIRFLUX_AUTOMATION_DEFAULTS}
    />
  );
}

/** PRE 21:00→09:30, OPEN 09:00→10:00, INTRA 10:00→16:00 — the engine's own class windows. */
const PAIRFLUX_SESSIONS = ["PRE", "OPEN", "INTRA"] as const;

const PAIRFLUX_AUTOMATION_DEFAULTS = {
  // The convergence threshold and the hold, matching the replay's own defaults so the stream and
  // the scanner agree before anyone touches a control.
  endSignalThreshold: 0.2,
  minHoldMinutes: 3,
  // No early cutoff. Arbitrage stops entries at 09:20 because its ARK burst ends there; PairFlux
  // takes entries across the whole window it is set to, so the neutral value is the window's end.
  startCutoffTime: "16:00",
  // PRE begins where the class window begins.
  preStartTime: "21:00",
};
