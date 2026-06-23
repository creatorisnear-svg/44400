import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Loader2,
  Send,
  RefreshCw,
  TrendingUp,
  Wallet,
  Radio,
  Shield,
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
    green:  { text: "text-emerald-400", border: "border-emerald-500/20", glow: "shadow-emerald-500/10", bg: "bg-emerald-500/5" },
    yellow: { text: "text-yellow-400",  border: "border-yellow-500/20",  glow: "shadow-yellow-500/10",  bg: "bg-yellow-500/5"  },
    red:    { text: "text-red-400",     border: "border-red-500/20",     glow: "shadow-red-500/10",     bg: "bg-red-500/5"     },
    blue:   { text: "text-blue-400",    border: "border-blue-500/20",    glow: "shadow-blue-500/10",    bg: "bg-blue-500/5"    },
    purple: { text: "text-purple-400",  border: "border-purple-500/20",  glow: "shadow-purple-500/10",  bg: "bg-purple-500/5"  },
  };
  const a = accents[accent];
  return (
    <div className={`rounded-xl border ${a.border} ${a.bg} shadow-lg ${a.glow} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{title}</span>
        <div className={`${a.text} opacity-70`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className={`text-2xl font-bold ${a.text} leading-none`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

function AccountCard({ account }: { account: any }) {
  const statusMap: Record<string, { icon: any; label: string; dot: string; spin?: boolean }> = {
    connected:    { icon: Wifi,     label: "Online",      dot: "bg-emerald-400 animate-pulse" },
    connecting:   { icon: Loader2,  label: "Connecting",  dot: "bg-yellow-400 animate-pulse", spin: true },
    disconnected: { icon: WifiOff,  label: "Offline",     dot: "bg-gray-600" },
    error:        { icon: XCircle,  label: "Error",       dot: "bg-red-500" },
  };
  const s = statusMap[account.connectionStatus ?? "disconnected"] ?? statusMap.disconnected;
  const bal = account.balance ?? 0;
  const claimed = account.totalClaimed ?? 0;
  const sent = account.totalTransferred ?? 0;

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-800/50 p-4 flex items-center gap-4">
      <div className="flex flex-col items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-white truncate">{account.label}</span>
          {account.username && (
            <span className="text-[11px] text-gray-500 truncate">@{account.username}</span>
          )}
          <span className={`ml-auto text-[11px] font-medium ${
            s.label === "Online" ? "text-emerald-400" :
            s.label === "Connecting" ? "text-yellow-400" :
            s.label === "Error" ? "text-red-400" : "text-gray-500"
          }`}>{s.label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="bg-gray-900/60 rounded-lg px-2 py-1.5 text-center">
            <div className="text-gray-500 mb-0.5">Balance</div>
            <div className="text-yellow-400 font-bold font-mono">{bal.toLocaleString()}</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg px-2 py-1.5 text-center">
            <div className="text-gray-500 mb-0.5">Claimed</div>
            <div className="text-emerald-400 font-bold font-mono">{claimed.toLocaleString()}</div>
          </div>
          <div className="bg-gray-900/60 rounded-lg px-2 py-1.5 text-center">
            <div className="text-gray-500 mb-0.5">Sent</div>
            <div className="text-blue-400 font-bold font-mono">{sent.toLocaleString()}</div>
          </div>
        </div>
      </div>
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
    info:  "text-gray-600",
    warn:  "text-yellow-600",
    error: "text-red-600",
    debug: "text-gray-700",
  };

  return (
    <div className={`flex gap-2 leading-relaxed py-0.5 ${isNuke ? "bg-orange-950/20 -mx-3 px-3 rounded" : ""}`}>
      <span className="text-gray-700 shrink-0 font-mono text-[10px] mt-0.5">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
      <span className={`${levelColors[log.level] ?? "text-gray-600"} text-[10px] uppercase font-mono shrink-0 mt-0.5`}>
        [{log.level}]
      </span>
      <span className={`${msgClass} text-xs break-words min-w-0`}>{log.message}</span>
    </div>
  );
}

const TAX_RATE = 0.20;
const net = (gross: number) => Math.floor(gross * (1 - TAX_RATE));

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
    if (status === "sent") return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />;
    if (status === "error") return <XCircle className="w-3 h-3 text-red-400 shrink-0" />;
    if (status === "sending") return <Loader2 className="w-3 h-3 text-blue-400 shrink-0 animate-spin" />;
    return <span className="w-3 h-3 rounded-full border border-gray-600 shrink-0 inline-block" />;
  };

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <ArrowRightLeft className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-white">Fill Order Transfer</span>
      </div>

      {!activeFill ? (
        <form onSubmit={(e) => { e.preventDefault(); if (!toUsername.trim() || !amount) return; setError(null); fillMut.mutate({ toUsername: toUsername.trim().replace(/^@/, ""), totalAmount: Number(amount) }); }} className="space-y-3">
          <div>
            <Label className="text-xs text-gray-400 mb-1.5 block">Recipient Username</Label>
            <div className="flex gap-2 items-center">
              <span className="text-gray-500 text-sm font-mono">@</span>
              <Input className="bg-gray-900 border-gray-600 text-white flex-1 h-9" placeholder="username" value={toUsername} onChange={(e) => setToUsername(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-400 mb-1.5 block">Total Amount (gross)</Label>
            <Input type="number" min={1} className="bg-gray-900 border-gray-600 text-white h-9" placeholder="100000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {grossAmount > 0 && (
              <div className="mt-2 p-3 bg-gray-900/80 rounded-lg text-xs space-y-1.5 border border-gray-700/40">
                <div className="flex justify-between">
                  <span className="text-gray-500">You send</span>
                  <span className="text-white font-mono">{grossAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-500">Tax (20%)</span>
                  <span className="text-yellow-400 font-mono">−{Math.floor(grossAmount * TAX_RATE).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700 pt-1.5 mt-1">
                  <span className="text-emerald-400 font-medium">Recipient receives</span>
                  <span className="text-emerald-400 font-mono font-bold">{net(grossAmount).toLocaleString()}</span>
                </div>
              </div>
            )}
            <p className="text-[11px] text-gray-600 mt-1.5">Accounts fill in order — 10 min delay between each</p>
          </div>
          {error && <div className="p-2.5 bg-red-900/30 border border-red-700/60 rounded-lg text-xs text-red-300">{error}</div>}
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 h-9" disabled={fillMut.isPending || !toUsername.trim() || !amount}>
            <Send className="w-4 h-4 mr-2" />
            {fillMut.isPending ? "Starting..." : "Start Fill Order"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">→ <span className="text-white font-medium">@{fillOrder.toUsername}</span></div>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-red-400 hover:text-red-300" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>Cancel</Button>
          </div>
          <div className="bg-gray-900/60 rounded-lg p-3 space-y-1.5 border border-gray-700/40">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Sent (gross)</span>
              <span className="text-white font-mono">{fillOrder.totalSent.toLocaleString()} / {fillOrder.totalRequested.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-emerald-500">Received (−20%)</span>
              <span className="text-emerald-400 font-mono font-bold">{net(fillOrder.totalSent).toLocaleString()} / {net(fillOrder.totalRequested).toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-700/60 rounded-full h-1.5 mt-2">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (fillOrder.totalSent / fillOrder.totalRequested) * 100)}%` }} />
            </div>
          </div>
          <div className="space-y-1.5">
            {fillOrder.steps?.map((step: any, i: number) => (
              <div key={i} className="flex flex-col gap-0.5 text-xs p-2.5 bg-gray-900/50 rounded-lg border border-gray-700/30">
                <div className="flex items-center gap-2">
                  {stepIcon(step.status)}
                  <span className="text-gray-300 flex-1">{step.label}</span>
                  <div className="text-right shrink-0">
                    <div className="text-gray-400 font-mono">{step.amount.toLocaleString()} sent</div>
                    <div className="text-emerald-400 font-mono">{net(step.amount).toLocaleString()} rcvd</div>
                  </div>
                </div>
                {step.status === "error" && <span className="text-red-400 pl-5">{step.error}</span>}
              </div>
            ))}
          </div>
          {fillOrder.nextSendAt && (
            <div className="text-xs text-center text-gray-500">
              Next send in <span className="text-yellow-400 font-mono"><FillOrderCountdown target={fillOrder.nextSendAt} /></span>
            </div>
          )}
        </div>
      )}

      {fillOrder?.done && (
        <div className="p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-lg text-xs text-emerald-300 space-y-1">
          <div className="text-center font-semibold">✅ Fill order complete</div>
          <div className="flex justify-between">
            <span className="text-gray-400">Sent to @{fillOrder.toUsername}</span>
            <span className="font-mono">{fillOrder.totalSent.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-emerald-400">Recipient received</span>
            <span className="text-emerald-400 font-mono font-bold">{net(fillOrder.totalSent).toLocaleString()}</span>
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
    onSuccess: (data) => {
      setStatus("updating");
      setMsg("Waiting for balance replies…");
      onRefreshing();
      // Poll aggressively for 60s so updated balances appear as soon as they land in DB
      const start = Date.now();
      const poll = setInterval(() => {
        qc.invalidateQueries({ queryKey: ["accounts"] });
        if (Date.now() - start > 60_000) {
          clearInterval(poll);
          setStatus("done");
          setMsg("✓ Balances updated");
          setTimeout(() => { setStatus("idle"); setMsg(null); }, 5000);
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
        <span className={`text-xs ${status === "error" ? "text-red-400" : status === "done" ? "text-emerald-400" : "text-blue-400"}`}>
          {msg}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 gap-1.5"
        onClick={handleClick}
        disabled={status === "pending" || status === "updating"}
        title="Sends /balance to each account (20s between each)"
      >
        <RefreshCw className={`w-3 h-3 ${status === "pending" || status === "updating" ? "animate-spin" : ""}`} />
        {status === "pending" ? "Sending…" : status === "updating" ? "Updating…" : "Refresh Balances"}
      </Button>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [fastPoll, setFastPoll] = useState(false);
  const { data: status } = useStatus();
  const { data: logsData } = useLogs();
  const { data: accountsData } = useAccounts(fastPoll);
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const startMut = useMutation({
    mutationFn: () => apiFetch("/api/bot/start", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });

  const stopMut = useMutation({
    mutationFn: () => apiFetch("/api/bot/stop", { method: "POST" }),
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
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
    : "—";
  const totalBalance = accounts.reduce((s: number, a: any) => s + (a.balance ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800/60 bg-gray-900/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl">☢️</div>
            <div>
              <div className="text-base font-bold text-white leading-none">Nuke Bot</div>
              <div className="text-[10px] text-gray-500 leading-none mt-0.5">Clover Points Auto-Claimer</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                running && connectedCount > 0 ? "bg-emerald-400 animate-pulse" :
                running ? "bg-yellow-400 animate-pulse" : "bg-gray-600"
              }`} />
              <span className="text-gray-400 text-xs">
                {running ? (connectedCount > 0 ? `${connectedCount}/${totalAccounts} online` : "Connecting…") : "Offline"}
              </span>
            </div>
            {running ? (
              <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => stopMut.mutate()} disabled={stopMut.isPending}>
                <Square className="w-3 h-3 mr-1" /> Stop
              </Button>
            ) : (
              <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                Start Bot
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {(startMut.error || stopMut.error) && (
          <div className="p-3 bg-red-900/40 border border-red-700/60 rounded-xl text-sm text-red-300">
            {(startMut.error as Error)?.message ?? (stopMut.error as Error)?.message}
          </div>
        )}

        {/* Total balance banner */}
        {totalBalance > 0 && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Wallet className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-300">Total Balance Across All Accounts</span>
            </div>
            <span className="text-xl font-bold text-yellow-400 font-mono">{totalBalance.toLocaleString()}</span>
          </div>
        )}

        {/* Stat grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            title="Claims Today"
            value={(status?.totalClaimsToday ?? 0).toLocaleString()}
            sub={`${totalAccounts} account(s)`}
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
            icon={Shield}
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

        {/* Tabs */}
        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-1 h-auto flex-wrap gap-1">
            {[
              { value: "logs",     label: "Live Logs",  icon: Activity },
              { value: "accounts", label: "Accounts",   icon: Users },
              { value: "transfer", label: "Transfer",   icon: ArrowRightLeft },
              { value: "history",  label: "Events",     icon: History },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="config" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 rounded-lg px-3 py-1.5 text-xs font-medium">
              ⚙️ Config
            </TabsTrigger>
          </TabsList>

          {/* Live Logs */}
          <TabsContent value="logs">
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/40 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/60">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-gray-300">Bot Activity Log</span>
                  <span className="text-[10px] text-gray-600">({(logsData?.logs ?? []).length} entries)</span>
                </div>
                <button
                  className={`text-[11px] px-2 py-0.5 rounded border ${autoScroll ? "border-emerald-600/50 text-emerald-400" : "border-gray-600 text-gray-500"}`}
                  onClick={() => setAutoScroll((v) => !v)}
                >
                  Auto-scroll {autoScroll ? "ON" : "OFF"}
                </button>
              </div>
              <div ref={logRef} className="h-[420px] overflow-y-auto font-mono text-xs space-y-0 bg-gray-950/80 p-3">
                {(logsData?.logs ?? []).length === 0 ? (
                  <p className="text-gray-600 text-center mt-8">No logs yet. Start the bot to see activity.</p>
                ) : (
                  (logsData?.logs ?? []).map((log: any, i: number) => (
                    <LogEntry key={i} log={log} />
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Accounts */}
          <TabsContent value="accounts">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {accounts.length} account(s)
                  {totalBalance > 0 && (
                    <span className="ml-2 text-yellow-500">
                      · <span className="font-mono">{totalBalance.toLocaleString()}</span> total balance
                    </span>
                  )}
                </div>
                <RefreshBalancesButton onRefreshing={() => setFastPoll(true)} />
              </div>
              {accounts.length === 0 ? (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/40 py-10 text-center text-gray-600 text-sm">
                  No accounts configured. Go to Config → Accounts to add some.
                </div>
              ) : (
                accounts.map((acc: any) => <AccountCard key={acc.id} account={acc} />)
              )}
            </div>
          </TabsContent>

          {/* Transfer */}
          <TabsContent value="transfer">
            <div className="max-w-md">
              <TransferPanel fillOrder={status?.fillOrder ?? null} />
            </div>
          </TabsContent>

          {/* Events */}
          <TabsContent value="history">
            <EventsAndTransfers />
          </TabsContent>

          {/* Config */}
          <TabsContent value="config">
            <ConfigPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
