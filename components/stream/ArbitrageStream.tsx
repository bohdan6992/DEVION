"use client";

import StreamPageContainer from "./StreamPageContainer";

type ArbitrageStreamProps = {
  /** Distinct identity per parallel strategy. Defaults to the historical "stream.arbitrage". */
  instanceId?: string;
  /** Arbitration priority — HIGHER WINS when two strategies want the same ticker. */
  strategyPriority?: number;
  strategyLabel?: string;
  lsKeyPrefix?: string;
  headerTitle?: string;
};

export default function ArbitrageStream(props: ArbitrageStreamProps = {}) {
  return <StreamPageContainer {...props} />;
}
