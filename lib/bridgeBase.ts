// lib/bridgeBase.ts

const DEFAULT_LOCAL = "http://localhost:5197";

// Each Caesar browser engine keeps SSE feeds open. Chrome's HTTP/1.1 per-origin connection limit
// leaves only a small number of slots for ordinary Bridge requests, so serialising short polls
// through this two-slot gate prevents a status read from being aborted behind its own traffic.
const MAX_CONCURRENT_BRIDGE_REQUESTS = 2;
let activeBridgeRequests = 0;
const bridgeRequestWaiters: Array<() => void> = [];

async function acquireBridgeRequestSlot(): Promise<() => void> {
  if (activeBridgeRequests >= MAX_CONCURRENT_BRIDGE_REQUESTS) {
    await new Promise<void>((resolve) => bridgeRequestWaiters.push(resolve));
  }
  activeBridgeRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeBridgeRequests -= 1;
    bridgeRequestWaiters.shift()?.();
  };
}

function isBrowser() {
  return typeof window !== "undefined";
}

function stripTrailingSlashes(x: string) {
  return (x || "").replace(/\/+$/, "");
}

function sanitizeBridgeBase(x: string | null | undefined): string | null {
  const raw = (x ?? "").trim();
  if (!raw) return null;

  const s = stripTrailingSlashes(raw);

  // Must be absolute URL and only http/https
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // normalize: remove trailing slashes already done
    return stripTrailingSlashes(u.toString());
  } catch {
    return null;
  }
}

function readBridgeFromLocation(): string | null {
  if (!isBrowser()) return null;
  try {
    const u = new URL(window.location.href);
    const v = u.searchParams.get("bridge");
    return sanitizeBridgeBase(v);
  } catch {
    return null;
  }
}

function readBridgeFromStorage(): string | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem("bridgeApiBase");
    return sanitizeBridgeBase(v);
  } catch {
    return null;
  }
}

function writeBridgeToStorage(v: string) {
  if (!isBrowser()) return;
  const s = sanitizeBridgeBase(v);
  if (!s) return;
  try {
    window.localStorage.setItem("bridgeApiBase", s);
  } catch {}
}

export function getBridgeBaseUrl(): string {
  // 1) env override (public tunnel etc.)
  const envBase = sanitizeBridgeBase(process.env.NEXT_PUBLIC_BRIDGE_API);
  if (envBase) return envBase;

  // 2) browser: ?bridge= -> localStorage -> DEFAULT_LOCAL (✅ як у Tape)
  if (isBrowser()) {
    const fromUrl = readBridgeFromLocation();
    if (fromUrl) {
      writeBridgeToStorage(fromUrl);
      return fromUrl;
    }
    const fromLs = readBridgeFromStorage();
    if (fromLs) return fromLs;

    // DEFAULT_LOCAL should also be valid (http://localhost:5197)
    return sanitizeBridgeBase(DEFAULT_LOCAL) || DEFAULT_LOCAL;
  }

  // 3) SSR/server: no localhost fallback
  return "";
}

export function bridgeUrl(path: string) {
  const base = getBridgeBaseUrl();
  if (!base) {
    throw new Error(
      "BridgeClient: base URL is not set on the server. " +
        "Use client-side fetch (browser) or set NEXT_PUBLIC_BRIDGE_API to a public URL."
    );
  }

  // normalize path
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${stripTrailingSlashes(base)}${p}`;
}

/**
 * A bare `fetch` with no timeout, called from a `setInterval` poll, does not just hang once — the
 * NEXT tick fires anyway (the interval does not wait for the previous call to settle) and stacks
 * another request on top. Measured live 2026-09-09: a Caesar tab left open for hours accumulated
 * enough of these across its half-dozen polling loops (MM status, positions x2, strategy
 * heartbeat, automation heartbeat/state, plan) that Chrome refused EVERY subsequent request with
 * `net::ERR_INSUFFICIENT_RESOURCES` — indistinguishable, from the operator's chair, from the
 * bridge itself being down, even though a fresh curl to the same port answered in 3ms the whole
 * time. This is the fix for that class of bug: every poll loop gets a hard ceiling on how long one
 * request may stay outstanding before it is aborted and freed.
 */
/**
 * REVERTED 2026-09-11: this used to rewrite a `localhost` URL to `/api/bridge/proxy`, a Next.js
 * API route that re-issued the fetch server-side. That works only when the Next server itself runs
 * on the SAME machine as the bridge (`npm run dev`) - on a Vercel deployment the route runs on
 * Vercel's servers, where `localhost` is not the operator's PC, so every request failed and the
 * page reported "bridge not reached" no matter what was actually running locally. Back to a direct
 * browser fetch; CORS on the bridge already allows any *.vercel.app origin (Program.cs). If the
 * Chrome connection-exhaustion problem below resurfaces on a machine that also runs the bridge
 * locally, the fix is a public tunnel + NEXT_PUBLIC_BRIDGE_API, not resurrecting this proxy.
 */
export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  // Two persistent SSE connections (one per mounted strategy, see streamSseHub.ts) permanently
  // occupy 2 of Chrome's 6 concurrent connections per origin (plain http, so HTTP/1.1 — no
  // multiplexing), leaving ~4 for every short-lived poll to share. An 8s timeout let one blocked
  // slot stay blocked for a real 8 seconds before freeing up for the next queued request —
  // measured live 2026-09-09, this compounded into a 3+ minute heartbeat stall even after fixing
  // the outright duplicate pollers. The bridge itself answers in single-digit milliseconds always
  // (curl, checked repeatedly); 3s is still generous headroom and cuts the worst case by more than
  // half.
  timeoutMs = 3_000,
): Promise<Response> {
  const release = await acquireBridgeRequestSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    release();
  }
}
