import React from "react";
import { MinMaxRow } from "../../shared/ui";
import type { ScannerFilterBag } from "../../../../lib/scanner/filterState";
import type { SharedRangeFilterKey } from "../../../../lib/scanner/types";

/**
 * The shared min/max range filters — 37 rows over the ticker-level metadata every
 * strategy filters on. Reads ~145 fields, so it takes the filter bag whole rather
 * than that many props; the markup is unchanged from the scanners it came from.
 */
/**
 * Exactly the slice of the filter bag this panel reads.
 *
 * Narrower than ScannerFilterBag on purpose: the Sonar keeps its thresholds as individual useStates
 * and can satisfy this by mapping them, without being migrated onto useScannerFilters. A Scanner
 * passes its full bag, which is assignable.
 */
export type SharedMinMaxFilters = Pick<ScannerFilterBag,
  "maxAdv20" |
  "maxAdv20NF" |
  "maxAdv90" |
  "maxAdv90NF" |
  "maxAvPostMhVol90NF" |
  "maxAvPreMhValue20NF" |
  "maxAvPreMhValue90NF" |
  "maxAvPreMhVol90NF" |
  "maxAvPreMhv" |
  "maxAvgDailyValue20" |
  "maxAvgDailyValue90" |
  "maxClsToClsPct" |
  "maxImbExch1555" |
  "maxImbExch925" |
  "maxLo" |
  "maxLstCls" |
  "maxLstClsNewsCnt" |
  "maxLstPrcL" |
  "maxLstPrcLstClsPct" |
  "maxMarketCapM" |
  "maxPreMhBidLstPrcPct" |
  "maxPreMhHiLstClsPct" |
  "maxPreMhLoLstClsPct" |
  "maxPreMhLoLstPrcPct" |
  "maxPreMhMDV20NF" |
  "maxPreMhMDV90NF" |
  "maxPreMktVolNF" |
  "maxRoundLot" |
  "maxSpread" |
  "maxTCls" |
  "maxVWAP" |
  "maxVolNFfromLstCls" |
  "maxVolRel" |
  "maxVolatility20" |
  "maxVolatility90" |
  "maxYCls" |
  "minAdv20" |
  "minAdv20NF" |
  "minAdv90" |
  "minAdv90NF" |
  "minAvPostMhVol90NF" |
  "minAvPreMhValue20NF" |
  "minAvPreMhValue90NF" |
  "minAvPreMhVol90NF" |
  "minAvPreMhv" |
  "minAvgDailyValue20" |
  "minAvgDailyValue90" |
  "minClsToClsPct" |
  "minImbExch1555" |
  "minImbExch925" |
  "minLo" |
  "minLstCls" |
  "minLstClsNewsCnt" |
  "minLstPrcL" |
  "minLstPrcLstClsPct" |
  "minMarketCapM" |
  "minPreMhBidLstPrcPct" |
  "minPreMhHiLstClsPct" |
  "minPreMhLoLstClsPct" |
  "minPreMhLoLstPrcPct" |
  "minPreMhMDV20NF" |
  "minPreMhMDV90NF" |
  "minPreMktVolNF" |
  "minRoundLot" |
  "minSpread" |
  "minTCls" |
  "minVWAP" |
  "minVolNFfromLstCls" |
  "minVolRel" |
  "minVolatility20" |
  "minVolatility90" |
  "minYCls" |
  "setMaxAdv20" |
  "setMaxAdv20NF" |
  "setMaxAdv90" |
  "setMaxAdv90NF" |
  "setMaxAvPostMhVol90NF" |
  "setMaxAvPreMhValue20NF" |
  "setMaxAvPreMhValue90NF" |
  "setMaxAvPreMhVol90NF" |
  "setMaxAvPreMhv" |
  "setMaxAvgDailyValue20" |
  "setMaxAvgDailyValue90" |
  "setMaxClsToClsPct" |
  "setMaxImbExch1555" |
  "setMaxImbExch925" |
  "setMaxLo" |
  "setMaxLstCls" |
  "setMaxLstClsNewsCnt" |
  "setMaxLstPrcL" |
  "setMaxLstPrcLstClsPct" |
  "setMaxMarketCapM" |
  "setMaxPreMhBidLstPrcPct" |
  "setMaxPreMhHiLstClsPct" |
  "setMaxPreMhLoLstClsPct" |
  "setMaxPreMhLoLstPrcPct" |
  "setMaxPreMhMDV20NF" |
  "setMaxPreMhMDV90NF" |
  "setMaxPreMktVolNF" |
  "setMaxRoundLot" |
  "setMaxSpread" |
  "setMaxTCls" |
  "setMaxVWAP" |
  "setMaxVolNFfromLstCls" |
  "setMaxVolRel" |
  "setMaxVolatility20" |
  "setMaxVolatility90" |
  "setMaxYCls" |
  "setMinAdv20" |
  "setMinAdv20NF" |
  "setMinAdv90" |
  "setMinAdv90NF" |
  "setMinAvPostMhVol90NF" |
  "setMinAvPreMhValue20NF" |
  "setMinAvPreMhValue90NF" |
  "setMinAvPreMhVol90NF" |
  "setMinAvPreMhv" |
  "setMinAvgDailyValue20" |
  "setMinAvgDailyValue90" |
  "setMinClsToClsPct" |
  "setMinImbExch1555" |
  "setMinImbExch925" |
  "setMinLo" |
  "setMinLstCls" |
  "setMinLstClsNewsCnt" |
  "setMinLstPrcL" |
  "setMinLstPrcLstClsPct" |
  "setMinMarketCapM" |
  "setMinPreMhBidLstPrcPct" |
  "setMinPreMhHiLstClsPct" |
  "setMinPreMhLoLstClsPct" |
  "setMinPreMhLoLstPrcPct" |
  "setMinPreMhMDV20NF" |
  "setMinPreMhMDV90NF" |
  "setMinPreMktVolNF" |
  "setMinRoundLot" |
  "setMinSpread" |
  "setMinTCls" |
  "setMinVWAP" |
  "setMinVolNFfromLstCls" |
  "setMinVolRel" |
  "setMinVolatility20" |
  "setMinVolatility90" |
  "setMinYCls" |
  "sharedRangeFilterModes">;

export type SharedMinMaxPanelProps = {
  filters: SharedMinMaxFilters;
  zeroCoverageFilterKeys: Set<SharedRangeFilterKey>;
  toggleSharedRangeFilterMode: (key: SharedRangeFilterKey) => void;
  /**
   * Optional focus hooks, forwarded to every row. The Sonar uses them to hold its auto-refresh
   * while a threshold is being typed — without them the list reloads under the cursor. The
   * Scanners pass nothing and behave exactly as before.
   */
  onStartEditing?: () => void;
  onStopEditing?: () => void;
};

export default function SharedMinMaxPanel({
  filters,
  zeroCoverageFilterKeys,
  toggleSharedRangeFilterMode,
  onStartEditing,
  onStopEditing,
}: SharedMinMaxPanelProps) {
  const {
    maxAdv20,
    maxAdv20NF,
    maxAdv90,
    maxAdv90NF,
    maxAvPostMhVol90NF,
    maxAvPreMhValue20NF,
    maxAvPreMhValue90NF,
    maxAvPreMhVol90NF,
    maxAvPreMhv,
    maxAvgDailyValue20,
    maxAvgDailyValue90,
    maxClsToClsPct,
    maxImbExch1555,
    maxImbExch925,
    maxLo,
    maxLstCls,
    maxLstClsNewsCnt,
    maxLstPrcL,
    maxLstPrcLstClsPct,
    maxMarketCapM,
    maxPreMhBidLstPrcPct,
    maxPreMhHiLstClsPct,
    maxPreMhLoLstClsPct,
    maxPreMhLoLstPrcPct,
    maxPreMhMDV20NF,
    maxPreMhMDV90NF,
    maxPreMktVolNF,
    maxRoundLot,
    maxSpread,
    maxTCls,
    maxVWAP,
    maxVolNFfromLstCls,
    maxVolRel,
    maxVolatility20,
    maxVolatility90,
    maxYCls,
    minAdv20,
    minAdv20NF,
    minAdv90,
    minAdv90NF,
    minAvPostMhVol90NF,
    minAvPreMhValue20NF,
    minAvPreMhValue90NF,
    minAvPreMhVol90NF,
    minAvPreMhv,
    minAvgDailyValue20,
    minAvgDailyValue90,
    minClsToClsPct,
    minImbExch1555,
    minImbExch925,
    minLo,
    minLstCls,
    minLstClsNewsCnt,
    minLstPrcL,
    minLstPrcLstClsPct,
    minMarketCapM,
    minPreMhBidLstPrcPct,
    minPreMhHiLstClsPct,
    minPreMhLoLstClsPct,
    minPreMhLoLstPrcPct,
    minPreMhMDV20NF,
    minPreMhMDV90NF,
    minPreMktVolNF,
    minRoundLot,
    minSpread,
    minTCls,
    minVWAP,
    minVolNFfromLstCls,
    minVolRel,
    minVolatility20,
    minVolatility90,
    minYCls,
    setMaxAdv20,
    setMaxAdv20NF,
    setMaxAdv90,
    setMaxAdv90NF,
    setMaxAvPostMhVol90NF,
    setMaxAvPreMhValue20NF,
    setMaxAvPreMhValue90NF,
    setMaxAvPreMhVol90NF,
    setMaxAvPreMhv,
    setMaxAvgDailyValue20,
    setMaxAvgDailyValue90,
    setMaxClsToClsPct,
    setMaxImbExch1555,
    setMaxImbExch925,
    setMaxLo,
    setMaxLstCls,
    setMaxLstClsNewsCnt,
    setMaxLstPrcL,
    setMaxLstPrcLstClsPct,
    setMaxMarketCapM,
    setMaxPreMhBidLstPrcPct,
    setMaxPreMhHiLstClsPct,
    setMaxPreMhLoLstClsPct,
    setMaxPreMhLoLstPrcPct,
    setMaxPreMhMDV20NF,
    setMaxPreMhMDV90NF,
    setMaxPreMktVolNF,
    setMaxRoundLot,
    setMaxSpread,
    setMaxTCls,
    setMaxVWAP,
    setMaxVolNFfromLstCls,
    setMaxVolRel,
    setMaxVolatility20,
    setMaxVolatility90,
    setMaxYCls,
    setMinAdv20,
    setMinAdv20NF,
    setMinAdv90,
    setMinAdv90NF,
    setMinAvPostMhVol90NF,
    setMinAvPreMhValue20NF,
    setMinAvPreMhValue90NF,
    setMinAvPreMhVol90NF,
    setMinAvPreMhv,
    setMinAvgDailyValue20,
    setMinAvgDailyValue90,
    setMinClsToClsPct,
    setMinImbExch1555,
    setMinImbExch925,
    setMinLo,
    setMinLstCls,
    setMinLstClsNewsCnt,
    setMinLstPrcL,
    setMinLstPrcLstClsPct,
    setMinMarketCapM,
    setMinPreMhBidLstPrcPct,
    setMinPreMhHiLstClsPct,
    setMinPreMhLoLstClsPct,
    setMinPreMhLoLstPrcPct,
    setMinPreMhMDV20NF,
    setMinPreMhMDV90NF,
    setMinPreMktVolNF,
    setMinRoundLot,
    setMinSpread,
    setMinTCls,
    setMinVWAP,
    setMinVolNFfromLstCls,
    setMinVolRel,
    setMinVolatility20,
    setMinVolatility90,
    setMinYCls,
    sharedRangeFilterModes,
  } = filters;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
      <MinMaxRow label="ADV20" filterKey="adv20" mode={sharedRangeFilterModes.adv20} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv20} maxValue={maxAdv20} setMin={setMinAdv20} setMax={setMaxAdv20} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="ADV20NF" filterKey="adv20nf" mode={sharedRangeFilterModes.adv20nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv20NF} maxValue={maxAdv20NF} setMin={setMinAdv20NF} setMax={setMaxAdv20NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="ADV90" filterKey="adv90" mode={sharedRangeFilterModes.adv90} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv90} maxValue={maxAdv90} setMin={setMinAdv90} setMax={setMaxAdv90} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="ADV90NF" filterKey="adv90nf" mode={sharedRangeFilterModes.adv90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAdv90NF} maxValue={maxAdv90NF} setMin={setMinAdv90NF} setMax={setMaxAdv90NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="AvPreMhv" filterKey="avpremhv" mode={sharedRangeFilterModes.avpremhv} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhv} maxValue={maxAvPreMhv} setMin={setMinAvPreMhv} setMax={setMaxAvPreMhv} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="RoundLot" filterKey="roundlot" mode={sharedRangeFilterModes.roundlot} onToggleMode={toggleSharedRangeFilterMode} minValue={minRoundLot} maxValue={maxRoundLot} setMin={setMinRoundLot} setMax={setMaxRoundLot} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="VWAP" filterKey="vwap" mode={sharedRangeFilterModes.vwap} onToggleMode={toggleSharedRangeFilterMode} minValue={minVWAP} maxValue={maxVWAP} setMin={setMinVWAP} setMax={setMaxVWAP} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="SpreadBid%" filterKey="spread" mode={sharedRangeFilterModes.spread} onToggleMode={toggleSharedRangeFilterMode} minValue={minSpread} maxValue={maxSpread} setMin={setMinSpread} setMax={setMaxSpread} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="LstPrcL" filterKey="lstprcl" mode={sharedRangeFilterModes.lstprcl} onToggleMode={toggleSharedRangeFilterMode} minValue={minLstPrcL} maxValue={maxLstPrcL} setMin={setMinLstPrcL} setMax={setMaxLstPrcL} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="LstCls" filterKey="lstcls" mode={sharedRangeFilterModes.lstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minLstCls} maxValue={maxLstCls} setMin={setMinLstCls} setMax={setMaxLstCls} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="YCls" filterKey="ycls" mode={sharedRangeFilterModes.ycls} onToggleMode={toggleSharedRangeFilterMode} minValue={minYCls} maxValue={maxYCls} setMin={setMinYCls} setMax={setMaxYCls} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="TCls" filterKey="tcls" mode={sharedRangeFilterModes.tcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minTCls} maxValue={maxTCls} setMin={setMinTCls} setMax={setMaxTCls} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="ClsToCls%" filterKey="clstocls" mode={sharedRangeFilterModes.clstocls} onToggleMode={toggleSharedRangeFilterMode} minValue={minClsToClsPct} maxValue={maxClsToClsPct} setMin={setMinClsToClsPct} setMax={setMaxClsToClsPct} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="Lo" filterKey="lo" mode={sharedRangeFilterModes.lo} onToggleMode={toggleSharedRangeFilterMode} minValue={minLo} maxValue={maxLo} setMin={setMinLo} setMax={setMaxLo} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow
        label="LstClsNewsCnt"
        filterKey="lstclsnewscnt"
        mode={sharedRangeFilterModes.lstclsnewscnt}
        onToggleMode={toggleSharedRangeFilterMode}
        minValue={minLstClsNewsCnt}
        maxValue={maxLstClsNewsCnt}
        setMin={setMinLstClsNewsCnt}
        setMax={setMaxLstClsNewsCnt}
        card
        clearable
        onStartEditing={onStartEditing}
        onStopEditing={onStopEditing}
      />
      <MinMaxRow
        label="MarketCapM"
        filterKey="marketcapm"
        mode={sharedRangeFilterModes.marketcapm}
        onToggleMode={toggleSharedRangeFilterMode}
        minValue={minMarketCapM}
        maxValue={maxMarketCapM}
        setMin={setMinMarketCapM}
        setMax={setMaxMarketCapM}
        card
        clearable
        onStartEditing={onStartEditing}
        onStopEditing={onStopEditing}
      />
      <MinMaxRow label="PreMhVolNF" filterKey="premhvolnf" mode={sharedRangeFilterModes.premhvolnf} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMktVolNF} maxValue={maxPreMktVolNF} setMin={setMinPreMktVolNF} setMax={setMaxPreMktVolNF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow
        label="VolNFfromLstCls"
        filterKey="volnffromlstcls"
        mode={sharedRangeFilterModes.volnffromlstcls}
        onToggleMode={toggleSharedRangeFilterMode}
        minValue={minVolNFfromLstCls}
        maxValue={maxVolNFfromLstCls}
        setMin={setMinVolNFfromLstCls}
        setMax={setMaxVolNFfromLstCls}
        card
        clearable
        onStartEditing={onStartEditing}
        onStopEditing={onStopEditing}
        zeroCoverage={zeroCoverageFilterKeys.has("volnffromlstcls")}
      />
      <MinMaxRow label="AvPostMhVol90NF" filterKey="avpostmhvol90nf" mode={sharedRangeFilterModes.avpostmhvol90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPostMhVol90NF} maxValue={maxAvPostMhVol90NF} setMin={setMinAvPostMhVol90NF} setMax={setMaxAvPostMhVol90NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="AvPreMhVol90NF" filterKey="avpremhvol90nf" mode={sharedRangeFilterModes.avpremhvol90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhVol90NF} maxValue={maxAvPreMhVol90NF} setMin={setMinAvPreMhVol90NF} setMax={setMaxAvPreMhVol90NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} />
      <MinMaxRow label="AvPreMhValue20NF" filterKey="avpremhvalue20nf" mode={sharedRangeFilterModes.avpremhvalue20nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhValue20NF} maxValue={maxAvPreMhValue20NF} setMin={setMinAvPreMhValue20NF} setMax={setMaxAvPreMhValue20NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("avpremhvalue20nf")} />
      <MinMaxRow label="AvPreMhValue90NF" filterKey="avpremhvalue90nf" mode={sharedRangeFilterModes.avpremhvalue90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvPreMhValue90NF} maxValue={maxAvPreMhValue90NF} setMin={setMinAvPreMhValue90NF} setMax={setMaxAvPreMhValue90NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("avpremhvalue90nf")} />
      <MinMaxRow label="AvgDailyValue20" filterKey="avgdailyvalue20" mode={sharedRangeFilterModes.avgdailyvalue20} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvgDailyValue20} maxValue={maxAvgDailyValue20} setMin={setMinAvgDailyValue20} setMax={setMaxAvgDailyValue20} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("avgdailyvalue20")} />
      <MinMaxRow label="AvgDailyValue90" filterKey="avgdailyvalue90" mode={sharedRangeFilterModes.avgdailyvalue90} onToggleMode={toggleSharedRangeFilterMode} minValue={minAvgDailyValue90} maxValue={maxAvgDailyValue90} setMin={setMinAvgDailyValue90} setMax={setMaxAvgDailyValue90} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("avgdailyvalue90")} />
      <MinMaxRow label="Volatility20" filterKey="volatility20" mode={sharedRangeFilterModes.volatility20} onToggleMode={toggleSharedRangeFilterMode} minValue={minVolatility20} maxValue={maxVolatility20} setMin={setMinVolatility20} setMax={setMaxVolatility20} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("volatility20")} />
      <MinMaxRow label="Volatility90" filterKey="volatility90" mode={sharedRangeFilterModes.volatility90} onToggleMode={toggleSharedRangeFilterMode} minValue={minVolatility90} maxValue={maxVolatility90} setMin={setMinVolatility90} setMax={setMaxVolatility90} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("volatility90")} />
      <MinMaxRow label="PreMhMDV20NF" filterKey="premhmdv20nf" mode={sharedRangeFilterModes.premhmdv20nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhMDV20NF} maxValue={maxPreMhMDV20NF} setMin={setMinPreMhMDV20NF} setMax={setMaxPreMhMDV20NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("premhmdv20nf")} />
      <MinMaxRow label="PreMhMDV90NF" filterKey="premhmdv90nf" mode={sharedRangeFilterModes.premhmdv90nf} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhMDV90NF} maxValue={maxPreMhMDV90NF} setMin={setMinPreMhMDV90NF} setMax={setMaxPreMhMDV90NF} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("premhmdv90nf")} />
      <MinMaxRow label="VolRel" filterKey="volrel" mode={sharedRangeFilterModes.volrel} onToggleMode={toggleSharedRangeFilterMode} minValue={minVolRel} maxValue={maxVolRel} setMin={setMinVolRel} setMax={setMaxVolRel} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("volrel")} />
      <MinMaxRow label="PreMhHiLstPrc%" filterKey="premhbidlstprc" mode={sharedRangeFilterModes.premhbidlstprc} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhBidLstPrcPct} maxValue={maxPreMhBidLstPrcPct} setMin={setMinPreMhBidLstPrcPct} setMax={setMaxPreMhBidLstPrcPct} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("premhbidlstprc")} />
      <MinMaxRow label="PreMhLoLstPrc%" filterKey="premhlolstprc" mode={sharedRangeFilterModes.premhlolstprc} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhLoLstPrcPct} maxValue={maxPreMhLoLstPrcPct} setMin={setMinPreMhLoLstPrcPct} setMax={setMaxPreMhLoLstPrcPct} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("premhlolstprc")} />
      <MinMaxRow label="PreMhHiLstCls%" filterKey="premhhilstcls" mode={sharedRangeFilterModes.premhhilstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhHiLstClsPct} maxValue={maxPreMhHiLstClsPct} setMin={setMinPreMhHiLstClsPct} setMax={setMaxPreMhHiLstClsPct} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("premhhilstcls")} />
      <MinMaxRow label="PreMhLoLstCls%" filterKey="premhlolstcls" mode={sharedRangeFilterModes.premhlolstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minPreMhLoLstClsPct} maxValue={maxPreMhLoLstClsPct} setMin={setMinPreMhLoLstClsPct} setMax={setMaxPreMhLoLstClsPct} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("premhlolstcls")} />
      <MinMaxRow label="LstPrcLstCls%" filterKey="lstprclstcls" mode={sharedRangeFilterModes.lstprclstcls} onToggleMode={toggleSharedRangeFilterMode} minValue={minLstPrcLstClsPct} maxValue={maxLstPrcLstClsPct} setMin={setMinLstPrcLstClsPct} setMax={setMaxLstPrcLstClsPct} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("lstprclstcls")} />
      <MinMaxRow label="ImbExch9:25" filterKey="imbexch925" mode={sharedRangeFilterModes.imbexch925} onToggleMode={toggleSharedRangeFilterMode} minValue={minImbExch925} maxValue={maxImbExch925} setMin={setMinImbExch925} setMax={setMaxImbExch925} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("imbexch925")} />
      <MinMaxRow label="ImbExch15:55" filterKey="imbexch1555" mode={sharedRangeFilterModes.imbexch1555} onToggleMode={toggleSharedRangeFilterMode} minValue={minImbExch1555} maxValue={maxImbExch1555} setMin={setMinImbExch1555} setMax={setMaxImbExch1555} card clearable onStartEditing={onStartEditing} onStopEditing={onStopEditing} zeroCoverage={zeroCoverageFilterKeys.has("imbexch1555")} />
    </div>
  );
}
