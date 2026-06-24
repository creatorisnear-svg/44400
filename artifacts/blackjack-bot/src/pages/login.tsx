import { useState } from "react";
import { setToken } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { setError("Incorrect password"); setLoading(false); return; }
      const { token } = await res.json();
      setToken(token);
      onAuth();
    } catch {
      setError("Connection error — is the server running?");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-500/[0.035] rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-[340px] relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-[72px] h-[72px] rounded-[22px] bg-yellow-500/10 border border-yellow-500/25 mb-5 shadow-[0_0_50px_rgba(234,179,8,0.15)]">
            <span className="text-[34px] leading-none">☢️</span>
          </div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">AVIV</h1>
          <p className="text-[13px] text-zinc-500 mt-1">KA0SBOT · Clover Nuclear Auto-Claimer</p>
        </div>

        <div className="bg-[#111118] border border-white/[0.08] rounded-2xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                autoFocus
                className="w-full bg-[#1c1c26] border border-white/[0.08] text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-yellow-500/40 focus:shadow-[0_0_0_3px_rgba(234,179,8,0.08)] transition-all placeholder:text-zinc-700"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-red-500/8 border border-red-500/20 rounded-xl">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-red-400 text-xs">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl text-sm font-bold text-black bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(234,179,8,0.2)] hover:shadow-[0_0_35px_rgba(234,179,8,0.35)] active:scale-[0.98]"
            >
              {loading ? "Verifying…" : "Enter Dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
