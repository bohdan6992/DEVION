// lib/sifterHandoff.ts
export type SifterHandoff = {
  dateNy: string;
  ticker: string;
  minuteFrom?: string; // "09:31"
  minuteTo?: string;   // "10:15"
  metric?: string;
  ts: number; // Date.now()
};

const KEY = "tt.sifter.handoff.v1";

export function setSifterHandoff(x: Omit<SifterHandoff, "ts">) {
  const payload: SifterHandoff = { ...x, ts: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(payload));
  // optional: ping other windows
  try {
    const bc = new BroadcastChannel("sifter");
    bc.postMessage({ type: "HANDOFF", payload });
    bc.close();
  } catch {}
}

export function getSifterHandoff(): SifterHandoff | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SifterHandoff; } catch { return null; }
}

export function clearSifterHandoff() {
  localStorage.removeItem(KEY);
}
