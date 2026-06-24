import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Zap,
  Play,
  Square,
  Activity,
  History,
  Users,
  ArrowRightLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  RefreshCw,
  TrendingUp,
  Wallet,
  Radio,
  Shield,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ConfigPanel from "./config";
import EventsAndTransfers from "./sessions";
import { apiFetch } from "@/lib/api";

function useStatus() {
  return useQuery({
    queryKey: ["bot-status"],
    queryFn: () => apiFetch("/api/bot/status"),
    refetchInterval: 1500,
  });
}

function useLogs() {
  return useQuery({
    queryKey: ["logs"],
    queryFn: () => apiFetch("/api/logs?limit=200"),
    refetchInterval: 2000,
  });
}

function useAccounts(fastPoll = false) {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch("/api/accounts"),
    refetchInterval: fastPoll ? 2000 : 4000,
  });
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.floor((target - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return <span>{m}m {s.toString().padStart(2, "0")}s</span>;
}

function FillOrderCountdown({ target }: { target: number }) {
  const [secs, setSecs] = useState(Math.max(0, Math.round((target - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.round((target - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [target]);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span>{m}m {String(s).padStart(2, "0")}s</span>;
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  accent = "yellow",
}: {
  title: string;
  value: string | number | React.ReactNode;
  sub?: string;
  icon: any;
  accent?: "green" | "yellow" | "red" | "blue" | "purple";
}) {
  const accents = {
    green:  { text: "text-emerald-400", border: "border-emerald-500/30", glow: "shadow-emerald-500/5", bg: "bg-emerald-500/8", icon: "bg-emerald-500/15" },
    yellow: { text: "text-yellow-400",  border: "border-yellow-500/30",  glow: "shadow-yellow-500/5",  bg: "bg-yellow-500/8",  icon: "bg-yellow-500/15"  },
    red:    { text: "text-red-400",     border: "border-red-500/30",     glow: "shadow-red-500/5",     bg: "bg-red-500/8",     icon: "bg-red-500/15"     },
    blue:   { text: "text-blue-400",    border: "border-blue-500/30",    glow: "shadow-blue-500/5",    bg: "bg-blue-500/8",    icon: "bg-blue-500/15"    },
    purple: { text: "text-purple-400",  border: "border-purple-500/30",  glow: "shadow-purple-500/5",  bg: "bg-purple-500/8",  icon: "bg-purple-500/15"  },
  };
  const a = accents[accent];
  return (
    <div className={`rounded-2xl border ${a.border} ${a.bg} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{title}</span>
        <div className={`${a.icon} rounded-lg p-1.5`}>
          <Icon className={`w-3.5 h-3.5 ${a.text}`} />
        </div>
      </div>
      <div className={`text-2xl font-black ${a.text} leading-none tracking-tight`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-600 font-medium">{sub}</div>}
    </div>
  );
}

function AccountCard({ account, defaultRecipient }: { account: any; defaultRecipient?: string }) {
  const qc = useQueryClient();
  const statusMap: Record<string, { label: string; dot: string; badge: string }> = {
    connected:    { label: "Online",      dot: "bg-emerald-400 animate-pulse", badge: "text-emerald-400 bg-emerald-400/10" },
    connecting:   { label: "Connecting",  dot: "bg-yellow-400 animate-pulse",  badge: "text-yellow-400 bg-yellow-400/10"  },
    disconnected: { label: "Offline",     dot: "bg-gray-600",                  badge: "text-gray-500 bg-gray-500/10"      },
    error:        { label: "Error",       dot: "bg-red-500 animate-pulse",     badge: "text-red-400 bg-red-400/10"        },
  };
  const s = statusMap[account.connectionStatus ?? "disconnected"] ?? statusMap.disconnected;
  const bal = account.balance ?? 0;
  const claimed = account.totalClaimed ?? 0;
  const sent = account.totalTransferred ?? 0;
  const isConnected = account.connectionStatus === "connected";

  const [showSend, setShowSend] = useState(false);
  const [recipient, setRecipient] = useState(defaultRecipient ?? "");
  const [customAmount, setCustomAmount] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshBalance() {
    setRefreshing(true);
    try {
      const data = await apiFetch(`/api/accounts/${account.id}/refresh-balance`, { method: "POST" });
      if (data.balance !== null) {
        setResult({ ok: true, msg: `✓ Balance: ${data.balance.toLocaleString()}` });
      } else {
        setResult({ ok: false, msg: "No balance reply from KA0SBOT (timed out)" });
      }
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setRefreshing(false);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setTimeout(() => setResult(null), 5000);
    }
  }

  const sendMut = useMutation({
    mutationFn: (payload: { toUsername: string; amount: number }) =>
      apiFetch("/api/transfer", {
        method: "POST",
        body: JSON.stringify({ toUsername: payload.toUsername, amount: payload.amount, accountIds: [account.id] }),
      }),
    onSuccess: (data) => {
      const r = data.results?.[0];
      if (r?.success) {
        setResult({ ok: true, msg: `✓ Sent ${r.amount.toLocaleString()} to @${recipient}` });
        qc.invalidateQueries({ queryKey: ["accounts"] });
      } else {
        setResult({ ok: false, msg: r?.error ?? "Transfer failed" });
      }
      setTimeout(() => { setResult(null); setShowSend(false); setCustomAmount(""); }, 4000);
    },
    onError: (e) => {
      setResult({ ok: false, msg: (e as Error).message });
      setTimeout(() => setResult(null), 4000);
    },
  });

  const sendAmount = customAmount ? Number(customAmount) : bal;

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient.trim() || sendAmount <= 0) return;
    setResult(null);
    sendMut.mutate({ toUsername: recipient.trim().replace(/^@/, ""), amount: sendAmount });
  }

  return (
    <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="relative shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full block ${s.dot}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white truncate">{account.label}</span>
            {account.username && (
              <span className="text-[11px] text-gray-500">@{account.username}</span>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.badge}`}>{s.label}</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px bg-gray-700/30 border-t border-gray-700/40">
        <div className="bg-gray-900/50 px-3 py-3 text-center">
          <div className="text-[10px] text-gray-600 font-medium uppercase tracking-wide mb-1">Balance</div>
          <div className="text-yellow-400 font-black font-mono text-sm">{bal.toLocaleString()}</div>
        </div>
        <div className="bg-gray-900/50 px-3 py-3 text-center">
          <div className="text-[10px] text-gray-600 font-medium uppercase tracking-wide mb-1">Claimed</div>
          <div className="text-emerald-400 font-black font-mono text-sm">{claimed.toLocaleString()}</div>
        </div>
        <div className="bg-gray-900/50 px-3 py-3 text-center">
          <div className="text-[10px] text-gray-600 font-medium uppercase tracking-wide mb-1">Sent</div>
          <div className="text-blue-400 font-black font-mono text-sm">{sent.toLocaleString()}</div>
        </div>
      </div>

      {/* Actions */}
      {isConnected && !showSend && !result && (
        <div className="flex gap-2 p-3 border-t border-gray-700/30">
          {bal > 0 && (
            <button
              onClick={() => { setShowSend(true); setRecipient(defaultRecipient ?? ""); setCustomAmount(""); }}
              className="flex-1 h-10 text-xs text-blue-300 hover:text-blue-200 border border-blue-700/50 hover:border-blue-500/70 bg-blue-900/15 hover:bg-blue-900/25 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 font-semibold"
            >
              <Send className="w-3.5 h-3.5" />
              Send {bal.toLocaleString()}
            </button>
          )}
          <button
            onClick={refreshBalance}
            disabled={refreshing}
            className={`h-10 text-xs border rounded-xl px-4 flex items-center gap-1.5 transition-all active:scale-95 font-medium ${
              refreshing
                ? "text-gray-600 border-gray-700 bg-gray-800/50 cursor-not-allowed"
                : "text-gray-400 hover:text-yellow-300 border-gray-600 hover:border-yellow-600/60 bg-gray-900/40 hover:bg-yellow-900/10"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "…" : "Balance"}
          </button>
        </div>
      )}

      {/* Inline send form */}
      {showSend && !result && (
        <form onSubmit={handleSend} className="p-3 pt-2 border-t border-gray-700/30 space-y-2.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Quick Transfer</p>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-gray-900 border border-gray-600 rounded-xl px-3 h-11">
              <span className="text-gray-500 text-sm shrink-0 font-mono">@</span>
              <input
                className="bg-transparent text-white text-sm flex-1 outline-none placeholder:text-gray-600"
                placeholder="recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1 w-28 bg-gray-900 border border-gray-600 rounded-xl px-3 h-11">
              <input
                type="number"
                min={1}
                max={bal}
                className="bg-transparent text-white text-sm font-mono flex-1 outline-none placeholder:text-gray-600 w-full"
                placeholder={String(bal)}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
            </div>
          </div>
          {sendAmount > 0 && (
            <div className="text-[11px] text-gray-500 flex justify-between px-0.5">
              <span>Sending <span className="text-white font-mono font-bold">{sendAmount.toLocaleString()}</span></span>
              <span>Receives <span className="text-emerald-400 font-mono font-bold">{net(sendAmount).toLocaleString()}</span></span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!recipient.trim() || sendAmount <= 0 || sendMut.isPending}
              className="flex-1 h-11 text-sm bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 font-semibold"
            >
              {sendMut.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Send className="w-4 h-4" /> Send</>}
            </button>
            <button
              type="button"
              onClick={() => setShowSend(false)}
              className="h-11 text-sm text-gray-400 hover:text-gray-200 border border-gray-600 hover:border-gray-400 rounded-xl px-4 transition-all active:scale-95"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result && (
        <div className={`mx-3 mb-3 text-xs text-center py-2.5 rounded-xl font-semibold border ${
          result.ok
            ? "text-emerald-300 bg-emerald-900/25 border-emerald-700/40"
            : "text-red-300 bg-red-900/25 border-red-700/40"
        }`}>
          {result.msg}
        </div>
      )}
    </div>
  );
}

function LogEntry({ log }: { log: any }) {
  const isNuke = log.message?.includes("☢") || log.message?.includes("NUKE") || log.message?.includes("NUCLEAR");
  const isClaim = log.message?.includes("claimed") || log.message?.includes("✓");
  const isWarn = log.level === "warn";
  const isError = log.level === "error";
  const isBalance = log.message?.includes("💰");

  let msgClass = "text-gray-400";
  if (isError) msgClass = "text-red-300";
  else if (isWarn) msgClass = "text-yellow-300";
  else if (isNuke) msgClass = "text-orange-300 font-semibold";
  else if (isClaim) msgClass = "text-emerald-300";
  else if (isBalance) msgClass = "text-blue-300";

  const levelColors: Record<string, string> = {
    info:  "text-gray-700",
    warn:  "text-yellow-600",
    error: "text-red-500",
    debug: "text-gray-700",
  };

  return (
    <div className={`flex gap-2 py-1 leading-relaxed ${isNuke ? "bg-orange-950/30 -mx-3 px-3 rounded-lg border-l-2 border-orange-500/40" : ""}`}>
      <span className="text-gray-700 shrink-0 font-mono text-[10px] mt-0.5 tabular-nums">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
      <span className={`${levelColors[log.level] ?? "text-gray-600"} text-[10px] uppercase font-mono shrink-0 mt-0.5 w-8`}>
        {log.level === "error" ? "ERR" : log.level === "warn" ? "WRN" : "INF"}
      </span>
      <span className={`${msgClass} text-xs break-words min-w-0`}>{log.message}</span>
    </div>
  );
}

const TAX_RATE = 0.20;
const net = (gross: number) => Math.floor(gross * (1 - TAX_RATE));

function LiveTransferBanner({ fillOrder, onCancel }: { fillOrder: any; onCancel: () => void }) {
  if (!fillOrder) return null;

  const isActive = !fillOrder.done;
  const pct = fillOrder.totalRequested > 0
    ? Math.min(100, Math.round((fillOrder.totalSent / fillOrder.totalRequested) * 100))
    : 0;

  const stepIcon = (status: string) => {
    if (status === "sent")    return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (status === "error")   return <XCircle      className="w-4 h-4 text-red-400 shrink-0" />;
    if (status === "sending") return <Loader2      className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />;
    return <span className="w-4 h-4 rounded-full border-2 border-gray-600 shrink-0 inline-block" />;
  };

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${
      fillOrder.done
        ? "border-emerald-700/50 bg-emerald-900/15"
        : "border-blue-700/50 bg-blue-900/15"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ArrowRightLeft className={`w-4 h-4 shrink-0 ${fillOrder.done ? "text-emerald-400" : "text-blue-400"}`} />
          <span className="text-sm font-bold text-white truncate">
            {fillOrder.done ? "Transfer Complete" : "Transfer In Progress"}
          </span>
          <span className="text-xs text-gray-400 shrink-0">→ @{fillOrder.toUsername}</span>
        </div>
        {isActive && (
          <button
            onClick={onCancel}
            className="text-xs text-red-400 hover:text-red-300 border border-red-700/50 hover:border-red-500 px-3 py-1 rounded-lg transition-colors shrink-0 active:scale-95"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">
            <span className="text-white font-mono font-bold">{fillOrder.totalSent.toLocaleString()}</span>
            <span className="text-gray-600"> / {fillOrder.totalRequested.toLocaleString()} sent</span>
          </span>
          <span className="text-emerald-400 font-mono font-bold">
            +{net(fillOrder.totalSent).toLocaleString()} rcvd
          </span>
        </div>
        <div className="w-full h-2 bg-gray-700/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${fillOrder.done ? "bg-emerald-500" : "bg-blue-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-600 text-right font-mono">{pct}%</div>
      </div>

      <div className="space-y-1.5">
        {(fillOrder.steps ?? []).map((step: any, i: number) => (
          <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs ${
            step.status === "sending" ? "bg-blue-900/25 border border-blue-700/40" :
            step.status === "sent"    ? "bg-emerald-900/15 border border-emerald-700/30" :
            step.status === "error"   ? "bg-red-900/25 border border-red-700/40" :
            "bg-gray-900/40 border border-gray-700/30"
          }`}>
            {stepIcon(step.status)}
            <span className="text-gray-200 font-medium flex-1 truncate">{step.label}</span>
            <div className="text-right shrink-0">
              {step.status === "pending" ? (
                <span className="text-gray-600 font-mono">{step.amount.toLocaleString()}</span>
              ) : (
                <>
                  <div className="text-gray-400 font-mono">{step.amount.toLocaleString()}</div>
                  {step.status === "sent" && (
                    <div className="text-emerald-400 font-mono font-bold">+{net(step.amount).toLocaleString()}</div>
                  )}
                  {step.status === "error" && (
                    <div className="text-red-400 text-[10px] max-w-24 truncate">{step.error}</div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {isActive && fillOrder.nextSendAt && (
        <div className="text-xs text-center text-gray-500 pt-1 border-t border-gray-700/40">
          Next in <span className="text-yellow-400 font-mono font-bold"><FillOrderCountdown target={fillOrder.nextSendAt} /></span>
        </div>
      )}

      {fillOrder.done && (
        <div className="text-xs text-center text-emerald-300 pt-1 border-t border-emerald-700/30 font-semibold">
          ✅ Done — {fillOrder.totalSent.toLocaleString()} sent · {net(fillOrder.totalSent).toLocaleString()} received
        </div>
      )}
    </div>
  );
}

function TransferPanel({ fillOrder }: { fillOrder: any }) {
  const qc = useQueryClient();
  const [toUsername, setToUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fillMut = useMutation({
    mutationFn: (data: { toUsername: string; totalAmount: number }) =>
      apiFetch("/api/transfer/fill", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ["bot-status"] }); },
    onError: (e) => setError((e as Error).message),
  });

  const cancelMut = useMutation({
    mutationFn: () => apiFetch("/api/transfer/fill/cancel", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });

  const activeFill = fillOrder && !fillOrder.done;
  const grossAmount = Number(amount) || 0;

  const stepIcon = (status: string) => {
    if (status === "sent") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (status === "error") return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    if (status === "sending") return <Loader2 className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-spin" />;
    return <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-600 shrink-0 inline-block" />;
  };

  return (
    <div className="space-y-4">
      {!activeFill ? (
        <div className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/15 rounded-lg p-1.5">
              <ArrowRightLeft className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-sm font-bold text-white">Fill Order Transfer</span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!toUsername.trim() || !amount) return;
              setError(null);
              fillMut.mutate({ toUsername: toUsername.trim().replace(/^@/, ""), totalAmount: Number(amount) });
            }}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs text-gray-400 mb-2 block font-semibold">Recipient Username</Label>
              <div className="flex gap-2 items-center bg-gray-900 border border-gray-600 focus-within:border-gray-400 rounded-xl px-4 h-12 transition-colors">
                <span className="text-gray-500 text-sm font-mono shrink-0">@</span>
                <input
                  className="bg-transparent text-white flex-1 outline-none placeholder:text-gray-600 text-sm"
                  placeholder="username"
                  value={toUsername}
                  onChange={(e) => setToUsername(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-400 mb-2 block font-semibold">Total Amount (gross)</Label>
              <input
                type="number"
                min={1}
                className="w-full bg-gray-900 border border-gray-600 focus:border-gray-400 text-white rounded-xl px-4 h-12 outline-none font-mono text-sm transition-colors placeholder:text-gray-600"
                placeholder="100000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {grossAmount > 0 && (
                <div className="mt-3 p-3 bg-gray-900/80 rounded-xl text-xs space-y-2 border border-gray-700/50">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">You send</span>
                    <span className="text-white font-mono font-bold">{grossAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-yellow-500">Tax (20%)</span>
                    <span className="text-yellow-400 font-mono">−{Math.floor(grossAmount * TAX_RATE).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-700 pt-2">
                    <span className="text-emerald-400 font-semibold">Recipient receives</span>
                    <span className="text-emerald-400 font-mono font-black text-sm">{net(grossAmount).toLocaleString()}</span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-gray-600 mt-2">Accounts fill in order — 10 min delay between each</p>
            </div>
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700/60 rounded-xl text-xs text-red-300 font-medium">{error}</div>
            )}
            <button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 text-sm font-bold"
              disabled={fillMut.isPending || !toUsername.trim() || !amount}
            >
              <Send className="w-4 h-4" />
              {fillMut.isPending ? "Starting…" : "Start Fill Order"}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-blue-700/50 bg-blue-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-sm font-bold text-white">Fill Order Active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">→ @{fillOrder.toUsername}</span>
              <button
                className="text-xs text-red-400 hover:text-red-300 border border-red-700/50 px-3 py-1.5 rounded-lg transition-colors active:scale-95"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="bg-gray-900/60 rounded-xl p-3 space-y-2 border border-gray-700/40">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Sent (gross)</span>
              <span className="text-white font-mono font-bold">{fillOrder.totalSent.toLocaleString()} / {fillOrder.totalRequested.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-emerald-500">Received (−20%)</span>
              <span className="text-emerald-400 font-mono font-bold">{net(fillOrder.totalSent).toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-700/60 rounded-full h-2 mt-1">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (fillOrder.totalSent / (fillOrder.totalRequested || 1)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            {fillOrder.steps?.map((step: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 text-xs p-2.5 bg-gray-900/50 rounded-xl border border-gray-700/30">
                {stepIcon(step.status)}
                <span className="text-gray-300 flex-1 font-medium truncate">{step.label}</span>
                <div className="text-right shrink-0">
                  <div className="text-gray-400 font-mono">{step.amount.toLocaleString()}</div>
                  {step.status === "sent" && <div className="text-emerald-400 font-mono font-bold">{net(step.amount).toLocaleString()}</div>}
                  {step.status === "error" && <div className="text-red-400 text-[10px]">failed</div>}
                </div>
              </div>
            ))}
          </div>

          {fillOrder.nextSendAt && (
            <div className="text-xs text-center text-gray-500 pt-1 border-t border-gray-700/40">
              Next in <span className="text-yellow-400 font-mono font-bold"><FillOrderCountdown target={fillOrder.nextSendAt} /></span>
            </div>
          )}
        </div>
      )}

      {fillOrder?.done && (
        <div className="p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-2xl text-sm text-emerald-300 space-y-2">
          <div className="text-center font-bold">✅ Fill order complete</div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Sent to @{fillOrder.toUsername}</span>
            <span className="font-mono font-bold">{fillOrder.totalSent.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-emerald-400">Recipient received</span>
            <span className="text-emerald-400 font-mono font-black">{net(fillOrder.totalSent).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshBalancesButton({ onRefreshing }: { onRefreshing: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"idle" | "pending" | "updating" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => apiFetch("/api/accounts/refresh-balances", { method: "POST" }),
    onSuccess: () => {
      setStatus("updating");
      setMsg("Waiting for replies…");
      onRefreshing();
      const start = Date.now();
      const poll = setInterval(() => {
        qc.invalidateQueries({ queryKey: ["accounts"] });
        if (Date.now() - start > 60_000) {
          clearInterval(poll);
          setStatus("done");
          setMsg("✓ Updated");
          setTimeout(() => { setStatus("idle"); setMsg(null); }, 4000);
        }
      }, 2000);
    },
    onError: (e) => {
      setStatus("error");
      setMsg(`✗ ${(e as Error).message}`);
      setTimeout(() => { setStatus("idle"); setMsg(null); }, 4000);
    },
  });

  const handleClick = () => {
    setStatus("pending");
    setMsg(null);
    mut.mutate();
  };

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span className={`text-xs font-medium ${status === "error" ? "text-red-400" : status === "done" ? "text-emerald-400" : "text-blue-400"}`}>
          {msg}
        </span>
      )}
      <button
        className="h-9 px-3 text-xs border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 font-medium disabled:opacity-50"
        onClick={handleClick}
        disabled={status === "pending" || status === "updating"}
        title="Sends /balance to each account (10 min between each)"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${status === "pending" || status === "updating" ? "animate-spin" : ""}`} />
        {status === "pending" ? "Sending…" : status === "updating" ? "Updating…" : "Refresh Balances"}
      </button>
    </div>
  );
}

type TabKey = "logs" | "accounts" | "transfer" | "history" | "config";

export default function Dashboard() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("logs");
  const [fastPoll, setFastPoll] = useState(false);
  const { data: status } = useStatus();
  const { data: logsData } = useLogs();
  const { data: accountsData } = useAccounts(fastPoll);
  const { data: settings } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => apiFetch("/api/bot/settings"),
    staleTime: 30_000,
  });
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [statsCollapsed, setStatsCollapsed] = useState(false);

  const startMut = useMutation({
    mutationFn: () => apiFetch("/api/bot/start", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });
  const stopMut = useMutation({
    mutationFn: () => apiFetch("/api/bot/stop", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });
  const cancelFillMut = useMutation({
    mutationFn: () => apiFetch("/api/transfer/fill/cancel", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logsData, autoScroll]);

  const running = status?.running ?? false;
  const accounts = accountsData?.accounts ?? [];
  const connectedCount = (status?.accounts ?? []).filter((a: any) => a.connected).length;
  const totalAccounts = (status?.accounts ?? []).length;
  const uptime = status?.uptime ?? 0;
  const uptimeStr = uptime > 0
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : "—";
  const totalBalance = accounts.reduce((s: number, a: any) => s + (a.balance ?? 0), 0);
  const hasFill = status?.fillOrder && !status.fillOrder.done;

  const navItems: { key: TabKey; label: string; icon: any }[] = [
    { key: "logs",     label: "Logs",     icon: Activity },
    { key: "accounts", label: "Accounts", icon: Users },
    { key: "transfer", label: "Transfer", icon: ArrowRightLeft },
    { key: "history",  label: "Events",   icon: History },
    { key: "config",   label: "Config",   icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Sticky header ── */}
      <header className="border-b border-gray-800/70 bg-gray-900/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center shrink-0">
            <span className="text-base leading-none">☢️</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-white leading-none tracking-tight">AVIV</div>
            <div className="text-[10px] text-gray-600 leading-none mt-0.5 hidden sm:block">Clover Points Auto-Claimer</div>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 rounded-full px-3 py-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              running && connectedCount > 0 ? "bg-emerald-400 animate-pulse" :
              running ? "bg-yellow-400 animate-pulse" : "bg-gray-600"
            }`} />
            <span className="text-[11px] text-gray-400 whitespace-nowrap font-medium">
              {running ? (connectedCount > 0 ? `${connectedCount}/${totalAccounts}` : "…") : "Off"}
            </span>
          </div>

          {running ? (
            <button
              onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-full transition-all active:scale-95"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-full transition-all active:scale-95"
            >
              {startMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Start
            </button>
          )}
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-28 space-y-3">

          {(startMut.error || stopMut.error) && (
            <div className="p-4 bg-red-900/40 border border-red-700/60 rounded-2xl text-sm text-red-300 font-medium">
              {(startMut.error as Error)?.message ?? (stopMut.error as Error)?.message}
            </div>
          )}

          {/* ── Stats (collapsible when not on config tab) ── */}
          {tab !== "config" && (
            <div className="space-y-3">
              {/* Total balance banner */}
              {totalBalance > 0 && (
                <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/8 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-yellow-500/15 rounded-lg p-1.5">
                      <Wallet className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <div className="text-[10px] text-yellow-600 font-bold uppercase tracking-wide">Total Balance</div>
                      <div className="text-lg font-black text-yellow-400 font-mono leading-tight">{totalBalance.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-yellow-600/70 text-right">
                    <div>{accounts.filter((a: any) => (a.balance ?? 0) > 0).length} accounts</div>
                    <div>with balance</div>
                  </div>
                </div>
              )}

              {/* Stats grid with collapse toggle */}
              <div>
                <button
                  className="w-full flex items-center justify-between text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-2 py-1 active:opacity-70"
                  onClick={() => setStatsCollapsed(v => !v)}
                >
                  <span>Stats</span>
                  {statsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
                {!statsCollapsed && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatCard
                      title="Claims Today"
                      value={(status?.totalClaimsToday ?? 0).toLocaleString()}
                      sub={`${totalAccounts} account${totalAccounts !== 1 ? "s" : ""}`}
                      icon={Zap}
                      accent="yellow"
                    />
                    <StatCard
                      title="Scrap Today"
                      value={(status?.totalScrapToday ?? 0).toLocaleString()}
                      sub="clover points"
                      icon={TrendingUp}
                      accent="green"
                    />
                    <StatCard
                      title="Accounts"
                      value={`${connectedCount} / ${totalAccounts}`}
                      sub={running ? "monitoring" : "stopped"}
                      icon={Users}
                      accent={connectedCount > 0 ? "green" : "red"}
                    />
                    <StatCard
                      title={status?.nextAutoTransferAt ? "Next Transfer" : "Uptime"}
                      value={status?.nextAutoTransferAt ? <Countdown target={status.nextAutoTransferAt} /> : uptimeStr}
                      sub={status?.nextAutoTransferAt ? "auto-transfer" : running ? "running" : "offline"}
                      icon={status?.nextAutoTransferAt ? ArrowRightLeft : Clock}
                      accent="blue"
                    />
                  </div>
                )}
              </div>

              {/* Active fill order banner */}
              {status?.fillOrder && (
                <LiveTransferBanner fillOrder={status.fillOrder} onCancel={() => cancelFillMut.mutate()} />
              )}
            </div>
          )}

          {/* ── Tab content ── */}
          {tab === "logs" && (
            <div className="rounded-2xl border border-gray-700/50 bg-gray-900/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 bg-gray-900/80">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-gray-200">Live Log</span>
                  <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                    {(logsData?.logs ?? []).length}
                  </span>
                </div>
                <button
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-medium ${
                    autoScroll
                      ? "border-emerald-600/60 text-emerald-400 bg-emerald-900/20"
                      : "border-gray-600 text-gray-500 hover:text-gray-400"
                  }`}
                  onClick={() => setAutoScroll((v) => !v)}
                >
                  {autoScroll ? "▼ Auto" : "▼ Off"}
                </button>
              </div>
              <div ref={logRef} className="h-[52vh] overflow-y-auto bg-gray-950 p-3 space-y-0.5">
                {(logsData?.logs ?? []).length === 0 ? (
                  <p className="text-gray-600 text-center mt-16 text-sm">No logs yet — start the bot.</p>
                ) : (
                  (logsData?.logs ?? []).map((log: any, i: number) => <LogEntry key={i} log={log} />)
                )}
              </div>
            </div>
          )}

          {tab === "accounts" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs text-gray-400 font-semibold">
                    {accounts.length} account{accounts.length !== 1 ? "s" : ""}
                  </span>
                  {totalBalance > 0 && (
                    <span className="ml-2 text-xs text-yellow-500 font-mono font-bold">
                      · {totalBalance.toLocaleString()} total
                    </span>
                  )}
                </div>
                <RefreshBalancesButton onRefreshing={() => setFastPoll(true)} />
              </div>
              {accounts.length === 0 ? (
                <div className="rounded-2xl border border-gray-700/50 bg-gray-900/40 py-16 text-center space-y-2">
                  <Users className="w-8 h-8 text-gray-700 mx-auto" />
                  <p className="text-gray-500 text-sm">No accounts yet.</p>
                  <button
                    className="text-indigo-400 text-sm underline underline-offset-2"
                    onClick={() => setTab("config")}
                  >
                    Go to Config to add some
                  </button>
                </div>
              ) : (
                accounts.map((acc: any) => (
                  <AccountCard key={acc.id} account={acc} defaultRecipient={settings?.autoTransferRecipient ?? ""} />
                ))
              )}
            </div>
          )}

          {tab === "transfer" && (
            <TransferPanel fillOrder={status?.fillOrder ?? null} />
          )}

          {tab === "history" && <EventsAndTransfers />}

          {tab === "config" && <ConfigPanel />}
        </div>
      </main>

      {/* ── Fixed bottom navigation ── */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800/80 pb-safe">
        <div className="max-w-3xl mx-auto flex">
          {navItems.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            const showDot = key === "transfer" && hasFill;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-1 relative transition-all active:scale-95 min-h-[60px] ${
                  active ? "text-white" : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {active && (
                  <span className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-emerald-400" />
                )}
                <div className={`relative p-1.5 rounded-xl transition-colors ${active ? "bg-gray-800" : ""}`}>
                  <Icon className={`w-5 h-5 transition-transform ${active ? "scale-110" : ""}`} />
                  {showDot && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </div>
                <span className={`text-[10px] font-bold leading-none ${active ? "text-white" : "text-gray-600"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
