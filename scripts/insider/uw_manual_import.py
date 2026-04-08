import csv
import os
import sys
from datetime import datetime, timezone


INPUT_FILE = "uw_manual_flow.csv"
TEMPLATE_FILE = "uw_manual_flow_template.csv"
OUTPUT_RAW = "options_raw.csv"
MANUAL_FIELDNAMES = [
    "ticker",
    "option_chain",
    "type",
    "expiry",
    "strike",
    "underlying_price",
    "price",
    "volume",
    "open_interest",
    "total_premium",
    "volume_oi_ratio",
    "trade_count",
    "alert_rule",
    "has_sweep",
    "has_multileg",
    "all_opening_trades",
    "total_ask_side_prem",
    "total_bid_side_prem",
    "fetch_date",
]
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
    "source_total_premium",
    "source_volume_oi_ratio",
    "source_total_ask_side_prem",
    "source_total_bid_side_prem",
    "source_trade_count",
    "source_alert_rule",
    "source_has_sweep",
    "source_has_multileg",
    "source_all_opening",
    "data_source",
]
TEMPLATE_ROW = {
    "ticker": "NVDA",
    "option_chain": "NVDA260417C01000000",
    "type": "call",
    "expiry": "2026-04-17",
    "strike": "1000",
    "underlying_price": "921.45",
    "price": "22.10",
    "volume": "6480",
    "open_interest": "980",
    "total_premium": "14320800",
    "volume_oi_ratio": "6.61",
    "trade_count": "5",
    "alert_rule": "RepeatedHits",
    "has_sweep": "true",
    "has_multileg": "false",
    "all_opening_trades": "true",
    "total_ask_side_prem": "14100000",
    "total_bid_side_prem": "220800",
    "fetch_date": "2026-04-05T13:45:00Z",
}


def get_output_dir() -> str:
    output_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "insider")
    )
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


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


def safe_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def parse_iso_date(value):
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def normalize_type(value):
    text = str(value or "").strip().lower()
    if text in {"call", "c"}:
        return "call"
    if text in {"put", "p"}:
        return "put"
    return ""


def ensure_template_exists(output_dir):
    template_path = os.path.join(output_dir, TEMPLATE_FILE)
    if os.path.exists(template_path):
        return template_path
    with open(template_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANUAL_FIELDNAMES)
        writer.writeheader()
        writer.writerow(TEMPLATE_ROW)
    return template_path


def read_rows(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_rows(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=RAW_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def map_manual_row(row, now_iso):
    ticker = str(row.get("ticker") or "").strip().upper()
    opt_type = normalize_type(row.get("type"))
    expiry = str(row.get("expiry") or "").strip()
    strike = safe_float(row.get("strike"))
    current_price = safe_float(row.get("underlying_price"))

    if not ticker or not opt_type or not expiry or strike <= 0 or current_price <= 0:
        return None

    if opt_type == "call":
        strike_pct_otm = ((strike / current_price) - 1.0) * 100.0
    else:
        strike_pct_otm = ((current_price / strike) - 1.0) * 100.0

    expiry_dt = parse_iso_date(expiry)
    days_to_exp = 0
    if expiry_dt is not None:
        if expiry_dt.tzinfo is None:
            expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
        days_to_exp = max(0, int((expiry_dt - datetime.now(timezone.utc)).days))

    volume = safe_int(row.get("volume"))
    open_interest = safe_int(row.get("open_interest"))
    price = safe_float(row.get("price"))
    total_premium = safe_float(row.get("total_premium"))
    if total_premium <= 0 and volume > 0 and price > 0:
        total_premium = volume * price * 100.0

    volume_oi_ratio = safe_float(row.get("volume_oi_ratio"))
    if volume_oi_ratio <= 0 and volume > 0 and open_interest > 0:
        volume_oi_ratio = volume / open_interest

    fetch_date = str(row.get("fetch_date") or now_iso).strip() or now_iso

    return {
        "ticker": ticker,
        "fetch_date": fetch_date,
        "expiration": expiry,
        "days_to_exp": days_to_exp,
        "opt_type": opt_type,
        "strike": round(strike, 4),
        "strike_pct_otm": round(strike_pct_otm, 4),
        "current_price": round(current_price, 4),
        "lastPrice": round(price, 4),
        "bid": 0.0,
        "ask": 0.0,
        "volume": volume,
        "openInterest": open_interest,
        "impliedVolatility": 0.0,
        "inTheMoney": strike_pct_otm <= 0,
        "contractSymbol": str(row.get("option_chain") or "").strip(),
        "source_total_premium": round(total_premium, 2),
        "source_volume_oi_ratio": round(volume_oi_ratio, 4),
        "source_total_ask_side_prem": round(safe_float(row.get("total_ask_side_prem")), 2),
        "source_total_bid_side_prem": round(safe_float(row.get("total_bid_side_prem")), 2),
        "source_trade_count": safe_int(row.get("trade_count")),
        "source_alert_rule": str(row.get("alert_rule") or "").strip(),
        "source_has_sweep": safe_bool(row.get("has_sweep")),
        "source_has_multileg": safe_bool(row.get("has_multileg")),
        "source_all_opening": safe_bool(row.get("all_opening_trades")),
        "data_source": "uw_manual",
    }


def main():
    output_dir = get_output_dir()
    template_path = ensure_template_exists(output_dir)
    input_path = os.path.join(output_dir, INPUT_FILE)
    output_path = os.path.join(output_dir, OUTPUT_RAW)

    if not os.path.exists(input_path):
        write_rows(output_path, [])
        print(
            f"[uw_manual_import] missing {input_path}. Use template {template_path} and save your filled file as {input_path}"
        )
        sys.exit(2)

    rows = read_rows(input_path)
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    imported = []
    skipped = 0
    for row in rows:
        mapped = map_manual_row(row, now_iso)
        if mapped is None:
            skipped += 1
            continue
        imported.append(mapped)

    write_rows(output_path, imported)
    print(
        f"[uw_manual_import] wrote {len(imported)} rows to {output_path} from {input_path}"
        + (f" ({skipped} skipped)" if skipped else "")
    )
    if not imported:
        sys.exit(2)


if __name__ == "__main__":
    main()
