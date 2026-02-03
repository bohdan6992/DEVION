// lib/bridgeEnv.ts
export function getBridgeBaseUrl(): string {
  const v =
    process.env.NEXT_PUBLIC_BRIDGE_API ||
    process.env.BRIDGE_API ||
    "http://localhost:5000";

  return v.replace(/\/+$/, "");
}
