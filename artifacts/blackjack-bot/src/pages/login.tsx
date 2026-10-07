import { useEffect, useState } from "react";
import { setToken } from "@/lib/api";
import { Button, Field, HaloMark, Input, Notice } from "@/components/halo/ui";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Mode = "env" | "stored" | "setup";

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [offline, setOffline] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/auth/status`)
      .then((r) => r.json())
      .then((d) => setMode(d.mode ?? "env"))
      .catch(() => {
        setOffline(true);
        setMode("env");
      });
  }, []);

  const setup = mode === "setup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (setup && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { token } = setup
        ? await post("/api/auth/setup", { code, password })
        : await post("/api/auth/login", { password });
      setToken(token);
      onAuth();
    } catch (err) {
      setError((err as Error).message === "Failed to fetch" ? "Can't reach the server." : (err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[360px]">
          <div className="flex items-center gap-2.5 mb-8">
            <HaloMark size={28} />
            <span className="text-lg font-semibold tracking-tight">Halo</span>
          </div>

          {mode === null ? null : (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight">
                {setup ? "Create your password" : "Sign in"}
              </h1>
              <p className="mt-1.5 text-[13px] text-fg-2 leading-relaxed">
                {setup
                  ? "First visit. Pick a password for this dashboard. You'll need the setup code from the server log."
                  : "Enter the dashboard password."}
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                {setup && (
                  <Field
                    label="Setup code"
                    htmlFor="code"
                    hint="Printed in the server log at startup, for example K7QM-2XPA."
                  >
                    <Input
                      id="code"
                      autoFocus
                      autoComplete="off"
                      className="font-mono uppercase tracking-wider"
                      placeholder="XXXX-XXXX"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                )}
                <Field label={setup ? "New password" : "Password"} htmlFor="pw" hint={setup ? "At least 8 characters." : undefined}>
                  <Input
                    id="pw"
                    type="password"
                    autoFocus={!setup}
                    autoComplete={setup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {setup && (
                  <Field label="Type it again" htmlFor="pw2">
                    <Input
                      id="pw2"
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </Field>
                )}

                {error && <Notice tone="bad">{error}</Notice>}
                {offline && !error && <Notice tone="warn">Can't reach the server. Is it running?</Notice>}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  busy={loading}
                  disabled={!password || (setup && (!code || !confirm))}
                >
                  {setup ? "Create password" : "Sign in"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
