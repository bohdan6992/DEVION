# scripts/quotes_snapshot.py
# pip install pywin32
import os, sys, time, json, argparse, tempfile, shutil
from typing import Dict, List, Tuple, Optional
import pythoncom
import win32com.client as win32

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--progId", default=os.environ.get("PROGID", "TradingApp"))
    p.add_argument("--tickers", required=True)  # "AAPL,AMZN,..."
    p.add_argument("--fields", required=True)   # "Bid,Ask,Volume,..."
    p.add_argument("--timeout", type=float, default=8.0)
    return p.parse_args()

def parse_val(v):
    if v is None: return None
    s = str(v)
    parts = s.split(";")
    last = parts[-1] if parts else s
    try:
        return float(last.replace(",", "."))
    except ValueError:
        return last

def safe_cell(ws, i, j, retries=40, delay=0.05):
    for _ in range(retries):
        try:
            return ws.Cells(i, j)
        except pythoncom.com_error as e:
            if e.hresult == -2147418111:  # RPC_E_CALL_REJECTED
                pythoncom.PumpWaitingMessages(); time.sleep(delay); continue
            raise

def safe_get(cell, retries=40, delay=0.05):
    for _ in range(retries):
        try:
            return cell.Value
        except pythoncom.com_error as e:
            if e.hresult == -2147418111:
                pythoncom.PumpWaitingMessages(); time.sleep(delay); continue
            raise

def start_excel():
    pythoncom.CoInitialize()
    xl = None
    try:
        xl = win32.gencache.EnsureDispatch("Excel.Application", bForDemand=True)
    except Exception:
        try:
            xl = win32.Dispatch("Excel.Application")
        except Exception:
            # спроба почистити gen_py і знову
            shutil.rmtree(os.path.join(tempfile.gettempdir(), "gen_py"), ignore_errors=True)
            from win32com.client import gencache
            for ver in [(1,9),(1,8),(1,7)]:
                try:
                    gencache.EnsureModule("{00020813-0000-0000-C000-000000000046}", 0, *ver)
                    break
                except Exception:
                    pass
            xl = win32.gencache.EnsureDispatch("Excel.Application")

    xl.Visible = False
    xl.DisplayAlerts = False
    wb = xl.Workbooks.Add()
    ws = wb.Worksheets(1)
    return xl, wb, ws

def close_excel(xl, wb):
    try: wb.Close(SaveChanges=False)
    except: pass
    try: xl.Quit()
    except: pass
    try: pythoncom.CoUninitialize()
    except: pass

def snapshot(prog_id: str, tickers: List[str], fields: List[str], timeout: float) -> Dict[str, Dict[str, Optional[float]]]:
    xl, wb, ws = start_excel()
    try:
        # шапка
        ws.Cells(1,1).Value = "Ticker"
        for j,f in enumerate(fields, start=2):
            ws.Cells(1,j).Value = f
        # формули RTD
        for i,t in enumerate(tickers, start=2):
            ws.Cells(i,1).Value = t
            for j,f in enumerate(fields, start=2):
                ws.Cells(i, j).Formula = f'=RTD("{prog_id}","","{t}","{f}")'

        # очікування даних
        deadline = time.time() + timeout
        total = len(tickers) * len(fields)
        while time.time() < deadline:
            filled = 0
            for i in range(2, 2+len(tickers)):
                for j in range(2, 2+len(fields)):
                    cell = safe_cell(ws, i, j)
                    v = safe_get(cell) if cell else None
                    if v not in (None, ""):
                        filled += 1
            if filled >= total * 0.5:  # достатньо для першого знімка
                break
            time.sleep(0.2)

        # читання значень
        out: Dict[str, Dict[str, Optional[float]]] = {}
        for i,t in enumerate(tickers, start=2):
            row: Dict[str, Optional[float]] = {}
            for j,f in enumerate(fields, start=2):
                cell = safe_cell(ws, i, j)
                raw = safe_get(cell) if cell else None
                row[f] = parse_val(raw)
            out[t] = row
        return out
    finally:
        close_excel(xl, wb)

def main():
    a = parse_args()
    tickers = [x.strip() for x in a.tickers.split(",") if x.strip()]
    fields  = [x.strip() for x in a.fields.split(",") if x.strip()]
    data = snapshot(a.progId, tickers, fields, a.timeout)
    print(json.dumps(data, ensure_ascii=False, separators=(",",":")))

if __name__ == "__main__":
    main()
