import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  Play,
  Square,
  Activity,
  History,
} from "lucide-react";
import ConfigPanel from "./config";
import SessionHistory from "./sessions";

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

function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => apiFetch("/api/stats"),
    refetchInterval: 5000,
  });
}

function useLogs() {
  return useQuery({
    queryKey: ["logs"],
    queryFn: () => apiFetch("/api/logs?limit=80"),
    refetchInterval: 2000,
  });
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  positive,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: any;
  positive?: boolean;
}) {
  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">{title}</span>
          <Icon
            className={`w-4 h-4 ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-yellow-400"}`}
          />
        </div>
        <div
          className={`text-2xl font-bold ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-white"}`}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
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

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: status } = useStatus();
  const { data: stats } = useStats();
  const { data: logsData } = useLogs();
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
  const connected = status?.connected ?? false;
  const winRate = stats?.winRate ?? 0;
  const scrapNet = stats?.scrapNet ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🃏 Blackjack Bot
            </h1>
            <p className="text-sm text-gray-400">Auto-plays blackjack on Kaos Bot</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
              />
              <span className="text-sm text-gray-400">
                {connected
                  ? `Connected${status?.username ? ` (${status.username})` : ""}`
                  : running
                    ? "Connecting..."
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
                Stop Bot
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-500 text-white"
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending}
              >
                <Play className="w-4 h-4 mr-1" />
                Start Bot
              </Button>
            )}
          </div>
        </div>

        {(startMut.error || stopMut.error) && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-300">
            {(startMut.error as Error)?.message ??
              (stopMut.error as Error)?.message}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Win Rate"
            value={`${(winRate * 100).toFixed(1)}%`}
            sub={`${stats?.wins ?? 0}W / ${stats?.losses ?? 0}L`}
            icon={Target}
            positive={winRate > 0.5 ? true : winRate < 0.45 ? false : undefined}
          />
          <StatCard
            title="Net Scrap"
            value={`${scrapNet >= 0 ? "+" : ""}${scrapNet.toLocaleString()}`}
            sub="all time"
            icon={scrapNet >= 0 ? TrendingUp : TrendingDown}
            positive={scrapNet > 0 ? true : scrapNet < 0 ? false : undefined}
          />
          <StatCard
            title="Total Hands"
            value={(stats?.totalHands ?? 0).toLocaleString()}
            sub={`${stats?.blackjacks ?? 0} blackjacks`}
            icon={Trophy}
          />
          <StatCard
            title="This Session"
            value={`${status?.handsThisSession ?? 0} hands`}
            sub={
              running
                ? `+${status?.scrapThisSession ?? 0} scrap`
                : "Not running"
            }
            icon={Activity}
            positive={
              running
                ? (status?.scrapThisSession ?? 0) >= 0
                  ? true
                  : false
                : undefined
            }
          />
        </div>

        {running && (
          <div className="mb-6 p-4 bg-gray-900 border border-gray-700 rounded-lg">
            <div className="flex items-center gap-4 flex-wrap text-sm">
              <span className="text-gray-400">
                State:{" "}
                <span className="text-white font-mono">
                  {status?.currentState ?? "—"}
                </span>
              </span>
              <span className="text-gray-400">
                Session hands:{" "}
                <span className="text-white">{status?.handsThisSession}</span>
              </span>
              <span className="text-gray-400">
                Session W/L:{" "}
                <span className="text-green-400">{status?.winsThisSession}W</span>
                {" / "}
                <span className="text-red-400">{status?.lossesThisSession}L</span>
              </span>
              <span className="text-gray-400">
                Uptime:{" "}
                <span className="text-white">
                  {Math.floor((status?.uptime ?? 0) / 60)}m{" "}
                  {(status?.uptime ?? 0) % 60}s
                </span>
              </span>
            </div>
          </div>
        )}

        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-700">
            <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">
              <Activity className="w-4 h-4 mr-1" />
              Live Logs
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-gray-700">
              ⚙️ Config
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-gray-700">
              <History className="w-4 h-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs">
            <Card className="bg-gray-900 border-gray-700">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-300">
                  Bot Log
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
                  className="h-80 overflow-y-auto font-mono text-xs space-y-1 bg-gray-950 rounded p-3"
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

          <TabsContent value="config">
            <ConfigPanel />
          </TabsContent>

          <TabsContent value="history">
            <SessionHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
