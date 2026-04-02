import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const opts = {
    input: null,
    output: null,
    format: "jsonl",
    band: "global",
    minRate: 0.6,
    minTotal: 20,
    inclusive: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--input" && next) {
      opts.input = next;
      i += 1;
      continue;
    }
    if (arg === "--output" && next) {
      opts.output = next;
      i += 1;
      continue;
    }
    if (arg === "--format" && next) {
      opts.format = String(next).trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--band" && next) {
      opts.band = String(next).trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--min-rate" && next) {
      opts.minRate = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--min-total" && next) {
      opts.minTotal = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--inclusive") {
      opts.inclusive = true;
    }
  }

  return opts;
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function passesThresholds(rate, total, minRate, minTotal, inclusive) {
  if (rate == null || total == null) return false;
  if (inclusive) return rate >= minRate && total >= minTotal;
  return rate > minRate && total > minTotal;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const args = parseArgs(process.argv);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const defaultInput = path.join(repoRoot, "axion-signals", "arbitrage", "best_params.jsonl");
const defaultOutput = path.join(
  repoRoot,
  "axion-signals",
  "arbitrage",
  args.format === "csv" ? "best_params.mini.csv" : "best_params.mini.jsonl",
);

const inputPath = path.resolve(args.input ?? defaultInput);
const outputPath = path.resolve(args.output ?? defaultOutput);
const band = args.band;

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const source = fs.readFileSync(inputPath, "utf8");
const lines = source.split(/\r?\n/);
const out = [];

let seen = 0;
let kept = 0;
let skippedInvalid = 0;

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line) continue;

  let row;
  try {
    row = JSON.parse(line);
  } catch {
    skippedInvalid += 1;
    continue;
  }

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    skippedInvalid += 1;
    continue;
  }

  if (!row.ticker) {
    // keep meta/header rows out of the mini file
    continue;
  }

  seen += 1;

  const rate = toNumber(row?.ratings?.[band]);
  const hard = toNumber(row?.hard_soft_share?.[band]?.hard) ?? 0;
  const soft = toNumber(row?.hard_soft_share?.[band]?.soft) ?? 0;
  const total = hard + soft;

  if (!passesThresholds(rate, total, args.minRate, args.minTotal, args.inclusive)) {
    continue;
  }

  if (args.format === "csv") {
    out.push({
      ticker: row.ticker ?? "",
      bench: row.bench ?? "",
      rating: rate ?? "",
      min_total: total,
      hard: hard,
      soft: soft,
      corr: row?.static?.corr ?? "",
      beta: row?.static?.beta ?? "",
      sigma: row?.static?.sigma ?? "",
    });
  } else {
    out.push(JSON.stringify(row));
  }
  kept += 1;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
if (args.format === "csv") {
  const header = ["ticker", "bench", "rating", "min_total", "hard", "soft", "corr", "beta", "sigma"];
  const csvLines = [header.join(",")];
  for (const row of out) {
    csvLines.push(header.map((key) => csvEscape(row[key])).join(","));
  }
  fs.writeFileSync(outputPath, csvLines.join("\n") + "\n", "utf8");
} else {
  fs.writeFileSync(outputPath, out.join("\n") + (out.length ? "\n" : ""), "utf8");
}

console.log(
  JSON.stringify(
    {
      input: inputPath,
      output: outputPath,
      format: args.format,
      band,
      minRate: args.minRate,
      minTotal: args.minTotal,
      inclusive: args.inclusive,
      seen,
      kept,
      skippedInvalid,
    },
    null,
    2,
  ),
);
