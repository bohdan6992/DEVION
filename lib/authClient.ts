// lib/authClient.ts

const AXI_BASE_URL = "http://localhost:5197";
const TOKEN_KEY = "axi_token";

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse =
  | { token: string; expires?: string }
  | { accessToken: string; expires?: string }; // на всяк випадок

export function getAxiBaseUrl(): string {
  return AXI_BASE_URL;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(req: LoginRequest): Promise<string> {
  const res = await fetch(`${AXI_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Login failed: HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as LoginResponse;

  // підтримка обох форматів відповіді
  const token = (data as any).token ?? (data as any).accessToken;
  if (!token) throw new Error("Login OK, but token is missing in response.");

  saveToken(token);
  return token;
}
