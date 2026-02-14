import { bridgeUrl } from "@/lib/bridgeBase";

export type ScanerRunRequestDto = any; // можеш підставити типи
export type ScanerRunResultDto = any;

async function postJson<T>(path: string, body: any): Promise<T> {
  const res = await fetch(bridgeUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} for ${path}\n${txt}`);
  }
  return (await res.json()) as T;
}

export const scanerClient = {
  run(req: ScanerRunRequestDto) {
    return postJson<ScanerRunResultDto>("/api/scaner/run", req);
  },
};