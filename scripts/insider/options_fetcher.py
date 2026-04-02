import csv
import os
import sys
import time
from datetime import datetime, timezone

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


def collect_rows():
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
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    rows = collect_rows()
    write_csv(rows)
    print(f"[options_fetcher] wrote {len(rows)} rows to {os.path.join(get_output_dir(), OUTPUT_RAW)}")
    if not rows:
        sys.exit(2)


if __name__ == "__main__":
    main()
