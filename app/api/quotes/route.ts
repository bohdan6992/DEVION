// app/api/quotes/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";

/* ====== CONFIG ====== */
const PYTHON_RAW =
  process.env.PYTHON || "C:\\Program Files\\Python38\\python.exe";
const PROGID = process.env.PROGID || "TradingApp";
const PYTHON = PYTHON_RAW.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

/* ====== INLINE PYTHON (як у тебе) ====== */
const PY_INLINE = String.raw`
import os, sys, time, json, pythoncom
import win32com.client as win32

PROGID  = sys.argv[1]
TICKERS = [x for x in sys.argv[2].split(",") if x]
FIELDS  = [x for x in sys.argv[3].split(",") if x]
TIMEOUT = float(sys.argv[4]) if len(sys.argv) > 4 else 10.0

def parse_val(v):
    if v is None: return None
    s = str(v); parts = s.split(";"); last = parts[-1] if parts else s
    try: return float(last.replace(",", "."))
    except: return last

def com_call(fn, *a, retries=50, delay=0.05, **kw):
    for _ in range(retries):
        try:
            return fn(*a, **kw)
        except pythoncom.com_error as e:
            if e.hresult in (-2147418111, -2147417848):
                pythoncom.PumpWaitingMessages(); time.sleep(delay); continue
            raise
        except Exception:
            time.sleep(delay)
    raise RuntimeError("COM call retry limit exceeded")

def start_excel():
    pythoncom.CoInitialize()
    try:
        xl = win32.DispatchEx("Excel.Application")
    except Exception:
        xl = win32.gencache.EnsureDispatch("Excel.Application", bForDemand=True)
    wb = com_call(xl.Workbooks.Add)
    ws = com_call(wb.Worksheets.__call__, 1)
    return xl, wb, ws

def safe_cell(ws, i, j): return com_call(ws.Cells.__call__, i, j)
def safe_get(cell): return com_call(lambda: cell.Value)

def main():
    xl, wb, ws = start_excel()
    try:
        safe_cell(ws,1,1).Value = "Ticker"
        for j,f in enumerate(FIELDS, start=2): safe_cell(ws,1,j).Value = f
        for i,t in enumerate(TICKERS, start=2):
            safe_cell(ws,i,1).Value = t
            for j,f in enumerate(FIELDS, start=2):
                safe_cell(ws,i,j).Formula = f'=RTD("{PROGID}","","{t}","{f}")'
        total = len(TICKERS)*len(FIELDS)
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            filled = 0
            for i in range(2,2+len(TICKERS)):
                for j in range(2,2+len(FIELDS)):
                    if safe_get(safe_cell(ws,i,j)) not in (None,""): filled += 1
            if filled >= total*0.5: break
            time.sleep(0.2)
        out = {}
        for i,t in enumerate(TICKERS, start=2):
            row = {}
            for j,f in enumerate(FIELDS, start=2):
                row[f] = parse_val(safe_get(safe_cell(ws,i,j)))
            out[t] = row
        print(json.dumps(out, ensure_ascii=False, separators=(",",":")))
    finally:
        try: wb.Close(SaveChanges=False)
        except: pass
        try: xl.Quit()
        except: pass
        try: pythoncom.CoUninitialize()
        except: pass

if __name__ == "__main__": main()
`;

/* ====== спавн Python ====== */
function runPython(args: string[], timeoutMs = 45000) {
  return new Promise<{
    ok: boolean;
    data?: any;
    error?: string;
    stdout?: string;
    stderr?: string;
    code?: number | null;
  }>((resolve) => {
    const child = spawn(PYTHON, ["-c", PY_INLINE, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let out = "";
    let err = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `spawn error: ${e.message}`,
        stdout: out,
        stderr: err,
        code: -1,
      });
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const exitCode = code;
      const isOk = exitCode === 0;

      if (killed) {
        return resolve({
          ok: false,
          error: `python timeout ${timeoutMs}ms`,
          stdout: out,
          stderr: err,
          code: exitCode,
        });
      }

      if (!isOk) {
        return resolve({
          ok: false,
          error: `python exit ${exitCode}`,
          stdout: out,
          stderr: err,
          code: exitCode,
        });
      }

      try {
        resolve({
          ok: true,
          data: JSON.parse(out.trim() || "{}"),
          stdout: out,
          stderr: err,
          code: exitCode,
        });
      } catch (e: any) {
        resolve({
          ok: false,
          error: `invalid json: ${e.message}`,
          stdout: out,
          stderr: err,
          code: exitCode,
        });
      }
    });
  });
}

/* ====== анти-гонки + мʼякий кеш ====== */
let inflight: Promise<any> | null = null;
let lastOk: { at: number; data: any } | null = null;
const SOFT_CACHE_MS = 1500;

async function runOnce(req: Request) {
  const url = new URL(req.url);
  const tickers =
    url.searchParams.get("tickers") ||
    "META,AAPL,AMZN,NFLX,PLTR,AMD,QQQ,SPY,SMH,IBIT,XLF,KRE,XLE,IWM,KWEB,ETHA";
  const fields =
    url.searchParams.get("fields") ||
    "Bid,Ask,Spread,BidSize,AskSize,VWAP,Exchange,ADV90,ATR14,ImbExch,ImbARCA,LstCls,TOpen";
  const timeout = url.searchParams.get("timeout") || "10";

  const args = [PROGID, tickers, fields, timeout];
  const r = await runPython(args, 45000);
  if (!r.ok) {
    throw NextResponse.json(
      {
        error: r.error,
        code: r.code,
        diag: { when: new Date().toISOString(), python: PYTHON, args },
        stderr: r.stderr,
        stdout: (r.stdout || "").slice(0, 4000),
      },
      { status: 500 }
    );
  }
  return r.data;
}

export async function GET(req: Request) {
  // 🔴 ВАЖЛИВО: у продакшні цей endpoint не використовуємо,
  // щоб не було spawn ENOENT на сервері.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "quotes-api-disabled-in-production",
        message:
          "Цей endpoint використовується лише локально. У продакшні дані потрібно отримувати напряму з TradingApp/TRAP на локальному пристрої.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const now = Date.now();
  if (lastOk && now - lastOk.at < SOFT_CACHE_MS) {
    return NextResponse.json(lastOk.data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (inflight) {
    try {
      const cached = await inflight;
      return NextResponse.json(cached, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {}
  }
  try {
    inflight = runOnce(req).finally(() => (inflight = null));
    const data = await inflight;
    lastOk = { at: Date.now(), data };
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (resp: any) {
    return resp instanceof NextResponse
      ? resp
      : NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
