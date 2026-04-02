import csv
import os
from collections import defaultdict


INPUT_FLAGGED = "options_flagged.csv"
OUTPUT_ACTORS = "actor_profiles.csv"


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


def build_profiles(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row.get("ticker", ""), row.get("opt_type", "call"))].append(row)

    profiles = []
    for (ticker, opt_type), items in groups.items():
        premiums = [safe_float(item.get("total_premium_usd")) for item in items]
        scores = [safe_float(item.get("anomaly_score")) for item in items]
        near_event = [
            item for item in items if safe_int(item.get("days_to_exp")) <= 7 and safe_float(item.get("strike_pct_otm")) >= 5
        ]

        trades = len(items)
        avg_anomaly_score = sum(scores) / trades if trades else 0.0
        total_premium_usd = sum(premiums)

        profiles.append(
            {
                "ticker": ticker,
                "opt_type": opt_type,
                "trades": trades,
                "wins": 0,
                "win_rate_pct": 0.0,
                "avg_return_T5": 0.0,
                "sharpe": 0.0,
                "total_premium_usd": round(total_premium_usd, 2),
                "avg_anomaly_score": round(avg_anomaly_score, 2),
                "trades_near_event": len(near_event),
                "is_smart_money": False,
            }
        )

    profiles.sort(key=lambda row: (-safe_float(row["win_rate_pct"]), -safe_float(row["total_premium_usd"])))
    return profiles


def main():
    output_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "insider")
    )
    os.makedirs(output_dir, exist_ok=True)
    rows = read_rows(os.path.join(output_dir, INPUT_FLAGGED))
    profiles = build_profiles(rows)
    fieldnames = [
        "ticker",
        "opt_type",
        "trades",
        "wins",
        "win_rate_pct",
        "avg_return_T5",
        "sharpe",
        "total_premium_usd",
        "avg_anomaly_score",
        "trades_near_event",
        "is_smart_money",
    ]
    with open(os.path.join(output_dir, OUTPUT_ACTORS), "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(profiles)
    print(f"[actor_profiler] wrote {len(profiles)} actor profiles")


if __name__ == "__main__":
    main()
