import csv
import os
import sys
import time
from datetime import datetime, timezone

import requests

try:
    import yfinance as yf
except Exception:
    yf = None


DEFAULT_TICKERS = [
    "AAPL",
    "AMD",
    "AMZN",
    "COIN",
    "GOOGL",
    "META",
    "MSFT",
    "NFLX",
    "NVDA",
    "PLTR",
    "QQQ",
    "SPY",
    "TSLA",
]

OUTPUT_RAW = "options_raw.csv"
UW_BASE_URL = "https://api.unusualwhales.com/api/option-trade/flow-alerts"
DEFAULT_UW_MIN_PREMIUM = 50_000
DEFAULT_UW_MAX_DTE = 45
DEFAULT_UW_LIMIT = 100


def get_output_dir() -> str:
    output_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "insider")
    )
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


def get_tickers():
    raw = os.environ.get("INSIDER_TICKERS", "")
    if not raw.strip():
        return DEFAULT_TICKERS
    return [item.strip().upper() for item in raw.split(",") if item.strip()]


def get_expiry_limit() -> int:
    try:
        return max(1, min(4, int(os.environ.get("INSIDER_EXPIRIES", "2"))))
    except ValueError:
        return 2


def get_source() -> str:
    source = os.environ.get("INSIDER_OPTIONS_SOURCE", "auto").strip().lower()
    if source in {"uw", "unusual_whales"}:
        return "unusual_whales"
    if source == "yfinance":
        return "yfinance"
    return "auto"


def get_unusual_whales_api_key() -> str:
    return (
        os.environ.get("UNUSUAL_WHALES_API_KEY", "").strip()
        or os.environ.get("UW_API_KEY", "").strip()
    )


def env_bool(name: str, default: bool | None = None) -> bool | None:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def get_uw_issue_types():
    raw = os.environ.get("UW_ISSUE_TYPES", "Common Stock,ETF")
    return [item.strip() for item in raw.split(",") if item.strip()]


def get_uw_limit() -> int:
    try:
        return max(1, min(200, int(os.environ.get("UW_LIMIT", str(DEFAULT_UW_LIMIT)))))
    except ValueError:
        return DEFAULT_UW_LIMIT


def get_uw_min_premium() -> int:
    try:
        return max(0, int(float(os.environ.get("UW_MIN_PREMIUM", str(DEFAULT_UW_MIN_PREMIUM)))))
    except ValueError:
        return DEFAULT_UW_MIN_PREMIUM


def get_uw_max_dte() -> int:
    try:
        return max(0, int(float(os.environ.get("UW_MAX_DTE", str(DEFAULT_UW_MAX_DTE)))))
    except ValueError:
        return DEFAULT_UW_MAX_DTE


def build_uw_query(ticker: str):
    params = [
        ("ticker_symbol", ticker),
        ("limit", str(get_uw_limit())),
        ("min_premium", str(get_uw_min_premium())),
        ("max_dte", str(get_uw_max_dte())),
    ]

    for issue_type in get_uw_issue_types():
        params.append(("issue_types[]", issue_type))

    bool_filters = {
        "all_opening": env_bool("UW_ALL_OPENING", True),
        "is_otm": env_bool("UW_IS_OTM", True),
        "vol_greater_oi": env_bool("UW_VOL_GREATER_OI", True),
        "size_greater_oi": env_bool("UW_SIZE_GREATER_OI", None),
        "is_multi_leg": env_bool("UW_IS_MULTI_LEG", False),
        "is_sweep": env_bool("UW_IS_SWEEP", None),
        "is_call": env_bool("UW_IS_CALL", None),
        "is_put": env_bool("UW_IS_PUT", None),
        "is_ask_side": env_bool("UW_IS_ASK_SIDE", None),
        "is_bid_side": env_bool("UW_IS_BID_SIDE", None),
    }
    for key, value in bool_filters.items():
        if value is not None:
            params.append((key, "true" if value else "false"))

    optional_numeric_filters = {
        "min_volume_oi_ratio": os.environ.get("UW_MIN_VOLUME_OI_RATIO", "").strip(),
        "min_dte": os.environ.get("UW_MIN_DTE", "").strip(),
        "min_size": os.environ.get("UW_MIN_SIZE", "").strip(),
        "min_volume": os.environ.get("UW_MIN_VOLUME", "").strip(),
        "max_spread": os.environ.get("UW_MAX_SPREAD", "").strip(),
        "min_ask_perc": os.environ.get("UW_MIN_ASK_PERC", "").strip(),
    }
    for key, value in optional_numeric_filters.items():
        if value:
            params.append((key, value))

    return params


def option_chain_for_ticker(ticker: str, expiry_limit: int):
    if yf is None:
        raise RuntimeError("yfinance is not installed")

    tk = yf.Ticker(ticker)
    expirations = list(tk.options or [])[:expiry_limit]
    if not expirations:
        return []
    history = tk.history(period="5d", auto_adjust=False)
    current_price = 0.0
    if not history.empty:
        current_price = safe_float(history["Close"].dropna().iloc[-1])

    chains = []
    for expiry in expirations:
        chain = tk.option_chain(expiry)
        chains.append(
            {
                "current_price": current_price,
                "expiration": expiry,
                "calls": chain.calls.to_dict("records") if chain.calls is not None else [],
                "puts": chain.puts.to_dict("records") if chain.puts is not None else [],
            }
        )
    return chains


def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value, default=0):
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_iso_date(value: str | None):
    if not value:
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


def map_contract_row(
    ticker: str,
    current_price: float,
    opt_type: str,
    contract: dict,
    fetch_ts: str,
    expiry_label: str,
):
    strike = safe_float(contract.get("strike"))
    if current_price <= 0 or strike <= 0:
        return None

    if opt_type == "call":
        strike_pct_otm = ((strike / current_price) - 1.0) * 100.0
    else:
        strike_pct_otm = ((current_price / strike) - 1.0) * 100.0

    expiration = expiry_label
    days_to_exp = 0
    if expiry_label:
        try:
            expiry_dt = datetime.fromisoformat(expiry_label).replace(tzinfo=timezone.utc)
            days_to_exp = max(0, int((expiry_dt - datetime.now(timezone.utc)).days))
        except ValueError:
            days_to_exp = 0

    return {
        "ticker": ticker,
        "fetch_date": fetch_ts,
        "expiration": expiration,
        "days_to_exp": days_to_exp,
        "opt_type": opt_type,
        "strike": round(strike, 4),
        "strike_pct_otm": round(strike_pct_otm, 4),
        "current_price": round(current_price, 4),
        "lastPrice": round(safe_float(contract.get("lastPrice")), 4),
        "bid": round(safe_float(contract.get("bid")), 4),
        "ask": round(safe_float(contract.get("ask")), 4),
        "volume": safe_int(contract.get("volume")),
        "openInterest": safe_int(contract.get("openInterest")),
        "impliedVolatility": round(safe_float(contract.get("impliedVolatility")), 6),
        "inTheMoney": bool(contract.get("inTheMoney")),
        "contractSymbol": contract.get("contractSymbol", ""),
    }


def map_uw_flow_alert(item: dict):
    ticker = str(item.get("ticker") or "").upper().strip()
    opt_type = str(item.get("type") or "").lower().strip()
    if not ticker or opt_type not in {"call", "put"}:
        return None

    underlying_price = safe_float(item.get("underlying_price"))
    strike = safe_float(item.get("strike"))
    if underlying_price <= 0 or strike <= 0:
        return None

    if opt_type == "call":
        strike_pct_otm = ((strike / underlying_price) - 1.0) * 100.0
    else:
        strike_pct_otm = ((underlying_price / strike) - 1.0) * 100.0

    created_at = str(item.get("created_at") or datetime.now(timezone.utc).replace(microsecond=0).isoformat())
    expiry = str(item.get("expiry") or "")

    days_to_exp = 0
    expiry_dt = parse_iso_date(expiry)
    if expiry_dt is not None:
        if expiry_dt.tzinfo is None:
            expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
        days_to_exp = max(0, int((expiry_dt - datetime.now(timezone.utc)).days))

    return {
        "ticker": ticker,
        "fetch_date": created_at,
        "expiration": expiry,
        "days_to_exp": days_to_exp,
        "opt_type": opt_type,
        "strike": round(strike, 4),
        "strike_pct_otm": round(strike_pct_otm, 4),
        "current_price": round(underlying_price, 4),
        "lastPrice": round(safe_float(item.get("price")), 4),
        "bid": 0.0,
        "ask": 0.0,
        "volume": safe_int(item.get("volume"), safe_int(item.get("total_size"))),
        "openInterest": safe_int(item.get("open_interest")),
        "impliedVolatility": 0.0,
        "inTheMoney": strike_pct_otm <= 0,
        "contractSymbol": str(item.get("option_chain") or ""),
        "source_total_premium": round(safe_float(item.get("total_premium")), 2),
        "source_volume_oi_ratio": round(safe_float(item.get("volume_oi_ratio")), 4),
        "source_total_ask_side_prem": round(safe_float(item.get("total_ask_side_prem")), 2),
        "source_total_bid_side_prem": round(safe_float(item.get("total_bid_side_prem")), 2),
        "source_trade_count": safe_int(item.get("trade_count")),
        "source_alert_rule": str(item.get("alert_rule") or ""),
        "source_has_sweep": bool(item.get("has_sweep")),
        "source_has_multileg": bool(item.get("has_multileg")),
        "source_all_opening": bool(item.get("all_opening_trades")),
        "data_source": "unusual_whales",
    }


def collect_rows_unusual_whales():
    api_key = get_unusual_whales_api_key()
    if not api_key:
        raise RuntimeError("Missing UNUSUAL_WHALES_API_KEY or UW_API_KEY")

    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": "CenturiON-options-fetcher/1.0",
        }
    )

    rows = []
    for ticker in get_tickers():
        try:
            response = session.get(UW_BASE_URL, params=build_uw_query(ticker), timeout=30)
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            print(f"[options_fetcher] Failed UW flow for {ticker}: {exc}", file=sys.stderr)
            continue

        items = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            print(f"[options_fetcher] Unexpected UW response for {ticker}", file=sys.stderr)
            continue

        for item in items:
            if not isinstance(item, dict):
                continue
            row = map_uw_flow_alert(item)
            if row is not None:
                rows.append(row)

        time.sleep(0.2)

    return rows


def collect_rows():
    source = get_source()
    api_key = get_unusual_whales_api_key()
    if source == "unusual_whales" or (source == "auto" and api_key):
        return collect_rows_unusual_whales()

    rows = []
    fetch_ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    expiry_limit = get_expiry_limit()

    for ticker in get_tickers():
        try:
            chains = option_chain_for_ticker(ticker, expiry_limit)
        except Exception as exc:
            print(f"[options_fetcher] Failed {ticker}: {exc}", file=sys.stderr)
            continue

        for chain in chains:
            current_price = safe_float(chain.get("current_price"))
            if current_price <= 0:
                continue

            expiry_label = str(chain.get("expiration") or "")
            for opt_type in ("call", "put"):
                key = "calls" if opt_type == "call" else "puts"
                for contract in chain.get(key, []):
                    row = map_contract_row(ticker, current_price, opt_type, contract, fetch_ts, expiry_label)
                    if row is not None:
                        rows.append(row)

            time.sleep(0.25)

    return rows


def write_csv(rows):
    output_path = os.path.join(get_output_dir(), OUTPUT_RAW)
    fieldnames = [
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
    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    rows = collect_rows()
    write_csv(rows)
    source = "Unusual Whales API" if rows and rows[0].get("data_source") == "unusual_whales" else "yfinance"
    print(f"[options_fetcher] wrote {len(rows)} rows from {source} to {os.path.join(get_output_dir(), OUTPUT_RAW)}")
    if not rows:
        sys.exit(2)


if __name__ == "__main__":
    main()
