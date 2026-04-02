import csv
import math
import os
from collections import defaultdict


INPUT_RAW = "options_raw.csv"
OUTPUT_SCORED = "options_scored.csv"
OUTPUT_FLAGGED = "options_flagged.csv"
FLAG_ORDER = ["VOL/OI", "Z-SCORE", "OTM-PREM", "SHORT-OTM", "HIGH-IV"]
RAW_FIELDNAMES = [
    "ticker",
    "fetch_date",
    "expiration",
    "days_to_exp",
    "opt_type",
    "strike",
    "strike_pct_otm",
    "current_price",
    "lastPrice",
    "bid",
    "ask",
    "volume",
    "openInterest",
    "impliedVolatility",
    "inTheMoney",
    "contractSymbol",
]
SCORED_FIELDNAMES = RAW_FIELDNAMES + [
    "vol_oi_ratio",
    "volume_zscore",
    "total_premium_usd",
    "iv_percentile",
    "anomaly_score",
    "flags",
]


def safe_float(value, default=0.0):
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value, default=0):
    try:
        if value in (None, ""):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def read_rows(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_rows(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def compute_zscores(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["ticker"], row["opt_type"])].append(row)

    zscores = {}
    for _, items in groups.items():
        volumes = [safe_float(item.get("volume")) for item in items]
        if len(volumes) < 3:
            continue
        mean = sum(volumes) / len(volumes)
        variance = sum((value - mean) ** 2 for value in volumes) / len(volumes)
        std = math.sqrt(variance)
        if std == 0:
            continue
        for item, volume in zip(items, volumes):
            zscores[item["contractSymbol"]] = round((volume - mean) / std, 2)
    return zscores


def compute_iv_percentiles(rows):
    sortable = [row for row in rows if safe_float(row.get("impliedVolatility")) > 0]
    sortable.sort(key=lambda row: safe_float(row.get("impliedVolatility")))
    result = {}
    if len(sortable) == 1:
        result[sortable[0]["contractSymbol"]] = 100.0
        return result
    for idx, row in enumerate(sortable):
        pct = round((idx / max(1, len(sortable) - 1)) * 100.0, 1)
        result[row["contractSymbol"]] = pct
    return result


def score_rows(rows):
    zscores = compute_zscores(rows)
    iv_percentiles = compute_iv_percentiles(rows)

    scored = []
    for row in rows:
        contract_symbol = row.get("contractSymbol", "")
        volume = safe_int(row.get("volume"))
        open_interest = safe_int(row.get("openInterest"))
        last_price = safe_float(row.get("lastPrice"))
        days_to_exp = safe_int(row.get("days_to_exp"))
        strike_pct_otm = safe_float(row.get("strike_pct_otm"))

        vol_oi_ratio = round(volume / open_interest, 2) if open_interest > 0 else 0.0
        volume_zscore = zscores.get(contract_symbol, 0.0)
        total_premium_usd = round(volume * last_price * 100.0, 0)
        iv_percentile = iv_percentiles.get(contract_symbol, 0.0)

        flags = []
        if vol_oi_ratio >= 3:
            flags.append("VOL/OI")
        if volume_zscore >= 3:
            flags.append("Z-SCORE")
        if strike_pct_otm >= 5 and total_premium_usd >= 50_000:
            flags.append("OTM-PREM")
        if days_to_exp <= 14 and strike_pct_otm >= 5 and volume >= 500:
            flags.append("SHORT-OTM")
        if iv_percentile >= 90:
            flags.append("HIGH-IV")

        scored.append(
            {
                **row,
                "vol_oi_ratio": vol_oi_ratio,
                "volume_zscore": volume_zscore,
                "total_premium_usd": int(total_premium_usd),
                "iv_percentile": iv_percentile,
                "anomaly_score": len(flags),
                "flags": " ".join([flag for flag in FLAG_ORDER if flag in flags]),
            }
        )

    scored.sort(
        key=lambda row: (
            -safe_int(row.get("anomaly_score")),
            -safe_float(row.get("total_premium_usd")),
        )
    )
    return scored


def main():
    output_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "insider")
    )
    os.makedirs(output_dir, exist_ok=True)
    raw_path = os.path.join(output_dir, INPUT_RAW)
    rows = read_rows(raw_path)
    if not rows:
        write_rows(os.path.join(output_dir, OUTPUT_SCORED), [], SCORED_FIELDNAMES)
        write_rows(os.path.join(output_dir, OUTPUT_FLAGGED), [], SCORED_FIELDNAMES)
        print("[anomaly_detector] no raw rows found")
        return

    scored = score_rows(rows)
    write_rows(os.path.join(output_dir, OUTPUT_SCORED), scored, SCORED_FIELDNAMES)

    flagged = [
        row for row in scored if safe_int(row.get("anomaly_score")) >= 2 and safe_float(row.get("total_premium_usd")) >= 10_000
    ]
    write_rows(os.path.join(output_dir, OUTPUT_FLAGGED), flagged, SCORED_FIELDNAMES)
    print(
        f"[anomaly_detector] wrote {len(scored)} scored rows and {len(flagged)} flagged rows"
    )


if __name__ == "__main__":
    main()
