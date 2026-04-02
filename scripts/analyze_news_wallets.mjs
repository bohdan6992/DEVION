import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const DEFAULT_EXACT_EVENTS = [
  ["2024-01-10", "SEC approves 11 spot Bitcoin ETFs", "+8% BTC", "UP"],
  ["2024-03-13", "Bitcoin new ATH $73,700", "+7% BTC", "UP"],
  ["2024-04-19", "Bitcoin Halving #4", "-6% -> +40%", "MIXED"],
  ["2024-05-20", "SEC turns on ETH ETF", "+20% ETH", "UP"],
  ["2024-07-05", "Mt. Gox repayments begin", "-15% BTC", "DOWN"],
  ["2024-07-23", "Ethereum ETF trading starts", "-4% ETH", "DOWN"],
  ["2024-07-31", "Bank of Japan hikes to 0.25%", "-26% BTC", "DOWN"],
  ["2024-08-05", "Crypto flash crash / carry unwind", "-18% BTC", "DOWN"],
  ["2024-10-12", "GOAT AI meme coin launch", "+1000% GOAT", "UP"],
  ["2024-11-06", "Trump wins US election", "+15% BTC, +40% DOGE", "UP"],
  ["2024-12-05", "BTC breaks $100,000", "+8% BTC", "UP"],
  ["2025-01-17", "Trump launches $TRUMP", "+inf -> -80% TRUMP", "MIXED"],
  ["2025-01-20", "Trump crypto executive order", "+5-15% broad", "UP"],
  ["2025-01-24", "Bank of Japan hikes to 0.50%", "-25-31% BTC", "DOWN"],
  ["2025-02-01", "Trump tariffs on Canada/Mexico/China", "-8% BTC, -15% ETH", "DOWN"],
  ["2025-02-12", "Milei launches LIBRA", "-90% LIBRA", "DOWN"],
  ["2025-02-21", "Bybit hack", "-10% ETH", "DOWN"],
  ["2025-03-06", "Strategic Bitcoin Reserve EO", "+5% -> -6% BTC", "MIXED"],
  ["2025-04-02", "Liberation Day tariffs", "-8% BTC", "DOWN"],
  ["2025-04-07", "Trade war escalation with China", "-12% ETH, -12% SOL", "DOWN"],
  ["2025-04-09", "Trump pauses tariffs for 90 days", "+5.5% BTC, +10% XRP/SOL", "UP"],
  ["2025-04-16", "Canada launches 4 Solana ETFs", "+8% SOL", "UP"],
  ["2025-10-06", "Bitcoin ATH $126,198", "+716% from 2022 low", "UP"],
  ["2025-10-10", "100% China tariffs crash", "-14% BTC, -20% ETH", "DOWN"],
  ["2025-12-19", "Bank of Japan hikes to 0.75%", "~+1.5% BTC", "UP"],
  ["2026-01-29", "BTC ETF record $818m outflow", "-15% BTC", "DOWN"],
  ["2026-03-23", "Risk-on negotiation reports", "+3% BTC", "UP"],
  ["2026-03-25", "Iran may seek peace with Israel", "+3% BTC", "UP"],
];

const DEFAULT_SKIPPED_EVENTS = [
  ["2024-06-12..2024-06-19", "Germany sells 50,000 BTC", "Range in source list"],
  ["2024-09", "BTC correction on recession fears", "Month-only date in source list"],
  ["2025-03..2025-04", "SEC closes case against Ripple", "Range/month-only date in source list"],
  ["2025-07", "BTC crosses $120,000", "Month-only date in source list"],
  ["2025-07", "GENIUS Act signed", "Month-only date in source list"],
  ["2025-07", "Galaxy Digital sells 80,000 BTC", "Month-only date in source list"],
  ["2025-11", "BTC ETF record outflows $7bn", "Month-only date in source list"],
  ["2026-02", "BTC drops below $60,000", "Month-only date in source list"],
  ["2026-03", "BTC ranges $60-70k", "Month-only date in source list"],
];

function parseUtc(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" UTC", "Z").replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value) {
  if (value == null || value === "" || value === "-" || value === "<nil>") return null;
  const numeric = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTimeUtc(date) {
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function buildTimestampSuffix(date = new Date()) {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function loadEventConfig(configPath) {
  if (!configPath) {
    return {
      exactEvents: DEFAULT_EXACT_EVENTS,
      skippedEvents: DEFAULT_SKIPPED_EVENTS,
    };
  }

  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Event config not found: ${resolved}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const exactEvents = Array.isArray(parsed.exactEvents) ? parsed.exactEvents : [];
  const skippedEvents = Array.isArray(parsed.skippedEvents) ? parsed.skippedEvents : [];

  return { exactEvents, skippedEvents };
}

function hitFromDirection(positionSide, btcDirection) {
  if (btcDirection === "MIXED" || btcDirection === "FLAT") return "NEUTRAL";
  if (positionSide === "LONG" && btcDirection === "UP") return "HIT";
  if (positionSide === "SHORT_BIAS" && btcDirection === "DOWN") return "HIT";
  if (positionSide === "LONG" && btcDirection === "DOWN") return "MISS";
  if (positionSide === "SHORT_BIAS" && btcDirection === "UP") return "MISS";
  return "UNKNOWN";
}

function buildWalletSummary(matches) {
  const byWallet = new Map();

  for (const row of matches) {
    const wallet = row.wallet_address;
    if (!byWallet.has(wallet)) {
      byWallet.set(wallet, {
        wallet_address: wallet,
        events_traded: 0,
        total_entries_24h_pre_news: 0,
        total_entry_usd: 0,
        total_profit_usd: 0,
        profitable_trades: 0,
        losing_trades: 0,
        flat_trades: 0,
        still_open_trades: 0,
        directional_hits: 0,
        directional_misses: 0,
        directional_neutral: 0,
        event_dates: new Set(),
        event_names: new Set(),
        tokens: new Set(),
      });
    }

    const agg = byWallet.get(wallet);
    agg.events_traded += 1;
    agg.total_entries_24h_pre_news += 1;
    agg.total_entry_usd += row.entry_usd ?? 0;
    agg.total_profit_usd += row.profit_usd ?? 0;
    agg.event_dates.add(row.event_date);
    agg.event_names.add(row.event_name);
    agg.tokens.add(row.token);

    if (row.trade_result === "PROFIT") agg.profitable_trades += 1;
    else if (row.trade_result === "LOSS") agg.losing_trades += 1;
    else if (row.trade_result === "FLAT") agg.flat_trades += 1;
    else agg.still_open_trades += 1;

    if (row.directional_result === "HIT") agg.directional_hits += 1;
    else if (row.directional_result === "MISS") agg.directional_misses += 1;
    else agg.directional_neutral += 1;
  }

  return Array.from(byWallet.values())
    .map((item) => ({
      wallet_address: item.wallet_address,
      events_traded: item.events_traded,
      total_entries_24h_pre_news: item.total_entries_24h_pre_news,
      total_entry_usd: Number(item.total_entry_usd.toFixed(2)),
      total_profit_usd: Number(item.total_profit_usd.toFixed(2)),
      profitable_trades: item.profitable_trades,
      losing_trades: item.losing_trades,
      flat_trades: item.flat_trades,
      still_open_trades: item.still_open_trades,
      directional_hits: item.directional_hits,
      directional_misses: item.directional_misses,
      directional_neutral: item.directional_neutral,
      direction_hit_rate_percent:
        item.directional_hits + item.directional_misses > 0
          ? Number(
              (
                (item.directional_hits * 100) /
                (item.directional_hits + item.directional_misses)
              ).toFixed(2),
            )
          : null,
      profit_rate_percent:
        item.profitable_trades + item.losing_trades > 0
          ? Number(
              (
                (item.profitable_trades * 100) /
                (item.profitable_trades + item.losing_trades)
              ).toFixed(2),
            )
          : null,
      event_dates: Array.from(item.event_dates).sort().join(", "),
      event_names: Array.from(item.event_names).sort().join(" | "),
      tokens: Array.from(item.tokens).sort().join(", "),
    }))
    .sort((a, b) => {
      if (b.directional_hits !== a.directional_hits) return b.directional_hits - a.directional_hits;
      if ((b.total_profit_usd ?? 0) !== (a.total_profit_usd ?? 0)) {
        return (b.total_profit_usd ?? 0) - (a.total_profit_usd ?? 0);
      }
      return b.events_traded - a.events_traded;
    });
}

function buildEventSummary(matches, events) {
  const byEvent = new Map();

  for (const event of events) {
    byEvent.set(event.event_name, {
      event_date: event.event_date,
      event_name: event.event_name,
      btc_move: event.btc_move,
      btc_direction: event.btc_direction,
      total_entries_24h_pre_news: 0,
      unique_wallets: new Set(),
      long_entries: 0,
      short_entries: 0,
      total_entry_usd: 0,
      profitable_trades: 0,
      losing_trades: 0,
      still_open_trades: 0,
      directional_hits: 0,
      directional_misses: 0,
      directional_neutral: 0,
    });
  }

  for (const row of matches) {
    const agg = byEvent.get(row.event_name);
    if (!agg) continue;
    agg.total_entries_24h_pre_news += 1;
    agg.unique_wallets.add(row.wallet_address);
    agg.total_entry_usd += row.entry_usd ?? 0;
    if (row.position_side === "LONG") agg.long_entries += 1;
    if (row.position_side === "SHORT_BIAS") agg.short_entries += 1;
    if (row.trade_result === "PROFIT") agg.profitable_trades += 1;
    if (row.trade_result === "LOSS") agg.losing_trades += 1;
    if (row.trade_result === "STILL_OPEN") agg.still_open_trades += 1;
    if (row.directional_result === "HIT") agg.directional_hits += 1;
    if (row.directional_result === "MISS") agg.directional_misses += 1;
    if (row.directional_result === "NEUTRAL") agg.directional_neutral += 1;
  }

  return Array.from(byEvent.values())
    .map((item) => ({
      event_date: item.event_date,
      event_name: item.event_name,
      btc_move: item.btc_move,
      btc_direction: item.btc_direction,
      total_entries_24h_pre_news: item.total_entries_24h_pre_news,
      unique_wallets: item.unique_wallets.size,
      long_entries: item.long_entries,
      short_entries: item.short_entries,
      total_entry_usd: Number(item.total_entry_usd.toFixed(2)),
      profitable_trades: item.profitable_trades,
      losing_trades: item.losing_trades,
      still_open_trades: item.still_open_trades,
      directional_hits: item.directional_hits,
      directional_misses: item.directional_misses,
      directional_neutral: item.directional_neutral,
    }))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/analyze_news_wallets.mjs <input.xlsx> [output.xlsx] [events.json]");
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  const outputPath =
    process.argv[3] ??
    path.join(
      path.dirname(resolvedInput),
      `${path.parse(resolvedInput).name}_news_wallet_stats_${buildTimestampSuffix()}.xlsx`,
    );
  const eventConfigPath = process.argv[4];
  const { exactEvents: configuredExactEvents, skippedEvents: configuredSkippedEvents } =
    loadEventConfig(eventConfigPath);

  const workbook = XLSX.readFile(resolvedInput, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  const sourceRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: null,
    raw: false,
  });

  const exactEvents = configuredExactEvents.map(([eventDate, eventName, btcMove, btcDirection]) => {
    const eventTime = new Date(`${eventDate}T00:00:00.000Z`);
    const windowStart = new Date(eventTime.getTime() - 24 * 60 * 60 * 1000);
    return {
      event_date: eventDate,
      event_name: eventName,
      btc_move: btcMove,
      btc_direction: btcDirection,
      event_time: eventTime,
      window_start: windowStart,
      window_end: eventTime,
    };
  });

  const matchedRows = [];

  for (const row of sourceRows) {
    const firstEntryTime = parseUtc(row.first_entry_time);
    const walletAddress = row.wallet_address ? String(row.wallet_address).trim() : "";
    const positionSide = row.position_side ? String(row.position_side).trim() : "";
    const token = row.token ? String(row.token).trim() : "";

    if (!firstEntryTime || !walletAddress || !positionSide || !token) continue;

    for (const event of exactEvents) {
      if (firstEntryTime >= event.window_start && firstEntryTime < event.window_end) {
        const entryUsd = toNumber(row.entry_usd) ?? 0;
        const profitUsd = toNumber(row.profit_usd) ?? 0;
        matchedRows.push({
          event_date: event.event_date,
          event_name: event.event_name,
          btc_move: event.btc_move,
          btc_direction: event.btc_direction,
          window_start_utc: formatDateTimeUtc(event.window_start),
          window_end_utc: formatDateTimeUtc(event.window_end),
          first_entry_time: row.first_entry_time,
          last_entry_time: row.last_entry_time,
          wallet_address: walletAddress,
          blockchain: row.blockchain,
          token,
          position_side: positionSide,
          trade_direction: row.trade_direction,
          entry_usd: entryUsd,
          entry_trades: toNumber(row.entry_trades),
          first_exit_time: row.first_exit_time,
          last_exit_time: row.last_exit_time,
          exit_usd: toNumber(row.exit_usd),
          profit_usd: profitUsd,
          profit_percent: toNumber(row.profit_percent),
          trade_result: row.trade_result,
          directional_result: hitFromDirection(positionSide, event.btc_direction),
        });
      }
    }
  }

  matchedRows.sort((a, b) => {
    const dateSort = a.event_date.localeCompare(b.event_date);
    if (dateSort !== 0) return dateSort;
    const walletSort = a.wallet_address.localeCompare(b.wallet_address);
    if (walletSort !== 0) return walletSort;
    return String(a.first_entry_time).localeCompare(String(b.first_entry_time));
  });

  const walletSummary = buildWalletSummary(matchedRows);
  const eventSummary = buildEventSummary(matchedRows, exactEvents);

  const summarySheet = XLSX.utils.json_to_sheet(walletSummary);
  const matchesSheet = XLSX.utils.json_to_sheet(matchedRows);
  const eventsSheet = XLSX.utils.json_to_sheet(eventSummary);
  const skippedSheet = XLSX.utils.json_to_sheet(
    configuredSkippedEvents.map(([dateLabel, eventName, reason]) => ({
      source_date_label: dateLabel,
      event_name: eventName,
      reason_skipped: reason,
    })),
  );

  const outWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWorkbook, summarySheet, "wallet_summary");
  XLSX.utils.book_append_sheet(outWorkbook, matchesSheet, "event_matches");
  XLSX.utils.book_append_sheet(outWorkbook, eventsSheet, "event_summary");
  XLSX.utils.book_append_sheet(outWorkbook, skippedSheet, "skipped_events");
  XLSX.writeFile(outWorkbook, outputPath);

  console.log(`INPUT=${resolvedInput}`);
  console.log(`OUTPUT=${outputPath}`);
  console.log(`MATCHED_ROWS=${matchedRows.length}`);
  console.log(`WALLET_SUMMARY_ROWS=${walletSummary.length}`);
  console.log(`EVENT_SUMMARY_ROWS=${eventSummary.length}`);
}

main();
