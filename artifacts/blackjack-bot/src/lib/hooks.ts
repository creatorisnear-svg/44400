import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

export interface Account {
  id: number;
  label: string;
  username: string | null;
  ign: string | null;
  balance: number;
  totalClaimed: number;
  totalTransferred: number;
  enabled: boolean;
  connected: boolean;
  connectionStatus: ConnectionStatus;
}

export interface FillStep {
  label: string;
  accountId: number;
  amount: number;
  status: "pending" | "sending" | "sent" | "skipped" | "error";
  error?: string;
}

export interface FillOrder {
  toUsername: string;
  totalRequested: number;
  totalSent: number;
  steps: FillStep[];
  nextSendAt: number | null;
  done: boolean;
}

export interface JoinStep {
  accountId: number;
  label: string;
  invite: string;
  status: "pending" | "joining" | "joined" | "already" | "skipped" | "error";
  error?: string;
}

export interface JoinJob {
  invites: { code: string; guildId: string | null; name: string }[];
  steps: JoinStep[];
  pace: "careful" | "quick";
  nextAt: number | null;
  done: boolean;
}

export interface BotStatus {
  running: boolean;
  accounts: { accountId: number; label: string; connected: boolean; status: ConnectionStatus }[];
  totalClaimsToday: number;
  totalScrapToday: number;
  uptime: number;
  nextAutoTransferAt: number | null;
  fillOrder: FillOrder | null;
  joinJob: JoinJob | null;
}

export interface SharedServer {
  id: string;
  name: string;
  accountIds: number[];
}

export interface BotSettings {
  id: number;
  serverId: string;
  channelId: string;
  cloverId: string;
  cloverPrefix: string;
  nukeKeywords: string;
  giveCommand: string;
  claimDelayMin: number;
  claimDelayMax: number;
  transferServer: number;
  transferChannelId: string;
  autoTransferEnabled: boolean;
  autoTransferRecipient: string;
  autoTransferIntervalMin: number;
  autoJoinServers: string;
  humanize: boolean;
  skipRate: number;
}

export interface LogLine {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  accountId: number | null;
}

export function useStatus() {
  return useQuery<BotStatus>({
    queryKey: ["bot-status"],
    queryFn: () => apiFetch("/api/bot/status"),
    refetchInterval: 1500,
  });
}

export function useAccounts(fast = false) {
  return useQuery<{ accounts: Account[] }>({
    queryKey: ["accounts"],
    queryFn: () => apiFetch("/api/accounts"),
    refetchInterval: fast ? 2000 : 4000,
  });
}

export function useSettings() {
  return useQuery<BotSettings>({
    queryKey: ["bot-settings"],
    queryFn: () => apiFetch("/api/bot/settings"),
    staleTime: 10_000,
  });
}

export function useServers() {
  return useQuery<{ online: number; servers: SharedServer[] }>({
    queryKey: ["servers"],
    queryFn: () => apiFetch("/api/servers"),
    refetchInterval: 5000,
  });
}

export function useLogs() {
  return useQuery<{ logs: LogLine[] }>({
    queryKey: ["logs"],
    queryFn: () => apiFetch("/api/logs?limit=300"),
    refetchInterval: 2000,
  });
}

/** Start / stop / restart, with the status refreshed afterwards. */
export function useBotControl() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["bot-status"] });
  const start = useMutation({ mutationFn: () => apiFetch("/api/bot/start", { method: "POST" }), onSettled: refresh });
  const stop = useMutation({ mutationFn: () => apiFetch("/api/bot/stop", { method: "POST" }), onSettled: refresh });
  const restart = useMutation({
    mutationFn: async () => {
      await apiFetch("/api/bot/stop", { method: "POST" });
      return apiFetch("/api/bot/start", { method: "POST" });
    },
    onSettled: refresh,
  });
  return { start, stop, restart };
}

/** What's still missing before the bot can run. */
export function useSetupState() {
  const { data: accountsData, isLoading: aLoading } = useAccounts();
  const { data: settings, isLoading: sLoading } = useSettings();
  const { data: status } = useStatus();
  const hasAccount = (accountsData?.accounts.length ?? 0) > 0;
  const hasWatch = !!(settings?.serverId && settings?.channelId);
  return {
    loading: aLoading || sLoading,
    hasAccount,
    hasWatch,
    running: status?.running ?? false,
    ready: hasAccount && hasWatch,
  };
}

/** Re-renders every second; for countdowns. */
export function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
