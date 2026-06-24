const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOKEN_KEY = "nuke_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, opts?: RequestInit): Promise<any> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(opts?.headers ?? {}),
    ...(token ? { "x-auth-token": token } : {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let msg = text || res.statusText;
    try {
      const json = JSON.parse(msg);
      if (json?.error) msg = json.error;
    } catch {}
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return {};
}
