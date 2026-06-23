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
} from "lucide-react";
import ConfigPanel from "./config";
import EventsAndTransfers from "./sessions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

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
    queryFn: () => apiFetch("/api/logs?limit=100"),
    refetchInterval: 2000,
  });
}

function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch("/api/accounts"),
    refetchInterval: 3000,
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

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color = "yellow",
}: {
  title: string;
  value: string | number | React.ReactNode;
  sub?: string;
  icon: any;
  color?: "green" | "yellow" | "red" | "blue";
}) {
  const colors = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
  };
  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">{title}</span>
          <Icon className={`w-4 h-4 ${colors[color]}`} />
        </div>
        <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function AccountCard({ account }: { account: any }) {
  const statusConfig: Record<string, { icon: any; label: string; color: string }> = {
    connected: { icon: Wifi, label: "Connected", color: "text-green-400" },
    connecting: { icon: Loader2, label: "Connecting", color: "text-yellow-400" },
    disconnected: { icon: WifiOff, label: "Offline", color: "text-gray-500" },
    error: { icon: XCircle, label: "Error", color: "text-red-400" },
  };
  const s = statusConfig[account.connectionStatus ?? "disconnected"] ?? statusConfig.disconnected;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
      <div className={`flex-shrink-0 ${s.color}`}>
        <s.icon className={`w-4 h-4 ${account.connectionStatus === "connecting" ? "animate-spin" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{account.label}</span>
          {account.username && (
            <span className="text-xs text-gray-500">@{account.username}</span>
          )}
        </div>
        <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
          <span>Balance: <span className="text-yellow-400">{(account.balance ?? 0).toLocaleString()}</span></span>
          <span>Claimed: <span className="text-green-400">{(account.totalClaimed ?? 0).toLocaleString()}</span></span>
          <span>Sent: <span className="text-blue-400">{(account.totalTransferred ?? 0).toLocaleString()}</span></span>
        </div>
      </div>
      <span className={`text-xs ${s.color} shrink-0`}>{s.label}</span>
    </div>
  );
}

function LogLevel({ level }: { level: string }) {
  const colors: Record<string, string> = {
    info: "text-blue-400",
    warn: "text-yellow-400",
    error: "text-red-400",
    debug: "text-gray-500",
  };
  return (
    <span className={`font-mono text-xs ${colors[level] ?? "text-gray-400"} uppercase`}>
      [{level}]
    </span>
  );
}

function TransferPanel() {
  const [toUsername, setToUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (data: { toUsername: string; amount: number | null }) =>
      apiFetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => setResult(data),
  });

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toUsername.trim()) return;
    setResult(null);
    mut.mutate({
      toUsername: toUsername.trim().replace(/^@/, ""),
      amount: amount ? Number(amount) : null,
    });
  };

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-blue-400" />
          Transfer Clover Points
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleTransfer} className="space-y-3">
          <div>
            <Label className="text-xs text-gray-400 mb-1 block">Recipient Username</Label>
            <div className="flex gap-2">
              <span className="text-gray-500 self-center text-sm">@</span>
              <Input
                className="bg-gray-800 border-gray-600 text-white flex-1"
                placeholder="creator5677"
                value={toUsername}
                onChange={(e) => setToUsername(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">No @ needed — just the username</p>
          </div>
          <div>
            <Label className="text-xs text-gray-400 mb-1 block">Amount (leave blank = full balance)</Label>
            <Input
              type="number"
              min={1}
              className="bg-gray-800 border-gray-600 text-white"
              placeholder="350000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500"
            disabled={mut.isPending || !toUsername.trim()}
          >
            <Send className="w-4 h-4 mr-2" />
            {mut.isPending ? "Sending..." : "Transfer from All Accounts"}
          </Button>
        </form>

        {mut.error && (
          <div className="mt-3 p-2 bg-red-900/40 border border-red-700 rounded text-xs text-red-300">
            {(mut.error as Error).message}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-gray-400 font-medium">
              Total transferred: <span className="text-green-400 font-bold">{result.totalTransferred?.toLocaleString()}</span> points
            </div>
            {result.results?.map((r: any) => (
              <div key={r.accountId} className="flex items-center gap-2 text-xs">
                {r.success ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className="text-gray-300">{r.label}</span>
                <span className={r.success ? "text-green-400" : "text-red-400"}>
                  {r.success ? `+${r.amount.toLocaleString()}` : r.error}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: status } = useStatus();
  const { data: logsData } = useLogs();
  const { data: accountsData } = useAccounts();
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
  const connectedCount = (status?.accounts ?? []).filter((a: any) => a.connected).length;
  const totalAccounts = (status?.accounts ?? []).length;
  const uptime = status?.uptime ?? 0;
  const uptimeStr = uptime > 0
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
    : "—";

  const accounts = accountsData?.accounts ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              ☢️ Nuke Bot
              <span className="text-sm font-normal text-gray-500">— Clover Points Auto-Claimer</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Monitors Discord for Nuclear Fallout events and claims rewards on all accounts
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  running && connectedCount > 0
                    ? "bg-green-400 animate-pulse"
                    : running
                      ? "bg-yellow-400 animate-pulse"
                      : "bg-gray-600"
                }`}
              />
              <span className="text-sm text-gray-400">
                {running
                  ? connectedCount > 0
                    ? `${connectedCount}/${totalAccounts} accounts online`
                    : "Connecting..."
                  : "Offline"}
              </span>
            </div>
            {running ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => stopMut.mutate()}
                disabled={stopMut.isPending}
              >
                <Square className="w-4 h-4 mr-1" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-500 text-white"
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending}
              >
                {startMut.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                Start Bot
              </Button>
            )}
          </div>
        </div>

        {(startMut.error || stopMut.error) && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-300">
            {(startMut.error as Error)?.message ?? (stopMut.error as Error)?.message}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Claims Today"
            value={(status?.totalClaimsToday ?? 0).toLocaleString()}
            sub={`${totalAccounts} account(s)`}
            icon={Zap}
            color="yellow"
          />
          <StatCard
            title="Scrap Today"
            value={(status?.totalScrapToday ?? 0).toLocaleString()}
            sub="clover points"
            icon={DollarSign}
            color="green"
          />
          <StatCard
            title="Accounts Online"
            value={`${connectedCount} / ${totalAccounts}`}
            sub={running ? "monitoring" : "stopped"}
            icon={Users}
            color={connectedCount > 0 ? "green" : "red"}
          />
          <StatCard
            title={status?.nextAutoTransferAt ? "Next Auto-Transfer" : "Uptime"}
            value={
              status?.nextAutoTransferAt
                ? <Countdown target={status.nextAutoTransferAt} />
                : uptimeStr
            }
            sub={
              status?.nextAutoTransferAt
                ? "then staggered per account"
                : running ? "running" : "not running"
            }
            icon={status?.nextAutoTransferAt ? ArrowRightLeft : Clock}
            color={status?.nextAutoTransferAt ? "blue" : "blue"}
          />
        </div>

        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-700 flex-wrap h-auto gap-1">
            <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">
              <Activity className="w-4 h-4 mr-1" />
              Live Logs
            </TabsTrigger>
            <TabsTrigger value="accounts" className="data-[state=active]:bg-gray-700">
              <Users className="w-4 h-4 mr-1" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="transfer" className="data-[state=active]:bg-gray-700">
              <ArrowRightLeft className="w-4 h-4 mr-1" />
              Transfer
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-gray-700">
              <History className="w-4 h-4 mr-1" />
              Events
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-gray-700">
              ⚙️ Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs">
            <Card className="bg-gray-900 border-gray-700">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-300">
                  Bot Activity Log
                </CardTitle>
                <button
                  className="text-xs text-gray-500 hover:text-gray-300"
                  onClick={() => setAutoScroll((v) => !v)}
                >
                  Auto-scroll: {autoScroll ? "ON" : "OFF"}
                </button>
              </CardHeader>
              <CardContent>
                <div
                  ref={logRef}
                  className="h-96 overflow-y-auto font-mono text-xs space-y-1 bg-gray-950 rounded p-3"
                >
                  {(logsData?.logs ?? []).length === 0 ? (
                    <p className="text-gray-600">No logs yet. Start the bot to see activity.</p>
                  ) : (
                    (logsData?.logs ?? []).map((log: any, i: number) => (
                      <div key={i} className="flex gap-2 leading-relaxed">
                        <span className="text-gray-600 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <LogLevel level={log.level} />
                        <span
                          className={
                            log.level === "error"
                              ? "text-red-300"
                              : log.level === "warn"
                                ? "text-yellow-300"
                                : log.message?.includes("NUKE") || log.message?.includes("☢")
                                  ? "text-orange-300 font-semibold"
                                  : "text-gray-300"
                          }
                        >
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts">
            <div className="space-y-3">
              {accounts.length === 0 ? (
                <Card className="bg-gray-900 border-gray-700">
                  <CardContent className="py-8 text-center text-gray-600">
                    No accounts configured. Go to Config → Accounts to add some.
                  </CardContent>
                </Card>
              ) : (
                accounts.map((acc: any) => (
                  <AccountCard key={acc.id} account={acc} />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="transfer">
            <div className="max-w-md">
              <TransferPanel />
            </div>
          </TabsContent>

          <TabsContent value="history">
            <EventsAndTransfers />
          </TabsContent>

          <TabsContent value="config">
            <ConfigPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
