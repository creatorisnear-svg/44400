import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Zap, ArrowRightLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NukeEventRow({ event }: { event: any }) {
  const [expanded, setExpanded] = useState(false);
  const successCount = event.claims?.filter((c: any) => c.success).length ?? 0;
  const totalAccounts = event.claims?.length ?? 0;
  const allGood = successCount === totalAccounts && totalAccounts > 0;
  const partial = successCount > 0 && successCount < totalAccounts;

  return (
    <div className={`bg-[#0f1115] border rounded-2xl overflow-hidden transition-shadow ${
      allGood ? "border-emerald-500/20" : partial ? "border-yellow-500/15" : "border-white/[0.06]"
    }`}>
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-white/[0.018] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          allGood ? "bg-emerald-500/10" : partial ? "bg-yellow-500/10" : "bg-orange-500/10"
        }`}>
          <Zap className={`w-4 h-4 ${allGood ? "text-emerald-400" : partial ? "text-yellow-400" : "text-orange-400"}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">Nuclear Fallout!</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
              allGood ? "bg-emerald-500/15 text-emerald-300"
              : partial ? "bg-yellow-500/15 text-yellow-300"
              : "bg-red-500/15 text-red-300"
            }`}>
              {successCount}/{totalAccounts} claimed
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-[11px] text-zinc-600">{timeAgo(event.detectedAt)}</span>
            {(event.totalScrapClaimed ?? 0) > 0 && (
              <span className="text-[11px] text-yellow-500 font-semibold font-mono">
                +{event.totalScrapClaimed?.toLocaleString()} scrap
              </span>
            )}
            <span className="text-[10px] text-zinc-700 font-mono">#{event.messageId?.slice(-6)}</span>
          </div>
        </div>

        <div className="text-zinc-700 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (event.claims?.length ?? 0) > 0 && (
        <div className="border-t border-white/[0.05] px-4 py-3 space-y-1.5">
          {event.claims.map((claim: any) => (
            <div
              key={claim.accountId}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs ${
                claim.success ? "bg-emerald-500/5" : "bg-red-500/5"
              }`}
            >
              {claim.success
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              <span className="text-zinc-300 font-medium flex-1 truncate min-w-0">
                {claim.label ?? `Account #${claim.accountId}`}
              </span>
              {claim.success ? (
                <span className="text-emerald-400 font-mono font-bold shrink-0">
                  +{claim.scrapGained?.toLocaleString()}
                </span>
              ) : (
                <span className="text-red-400/80 text-[10px] shrink-0 truncate max-w-[160px]">
                  {claim.error ?? "Failed"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TAX_RATE = 0.20;
const netReceived = (gross: number) => Math.floor(gross * (1 - TAX_RATE));

function TransferRow({ transfer }: { transfer: any }) {
  return (
    <div className={`bg-[#0f1115] border rounded-2xl px-4 py-3 ${
      transfer.success ? "border-blue-500/15" : "border-red-500/12"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          transfer.success ? "bg-blue-500/10" : "bg-red-500/10"
        }`}>
          {transfer.success
            ? <ArrowRightLeft className="w-4 h-4 text-blue-400" />
            : <XCircle className="w-4 h-4 text-red-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="text-white font-semibold">{transfer.fromLabel ?? `#${transfer.fromAccountId}`}</span>
            <span className="text-zinc-700 mx-1.5">→</span>
            <span className="text-blue-300">@{transfer.toUsername}</span>
          </div>
          {transfer.success && transfer.amount > 0 && (
            <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">
              <span className="text-blue-400 font-mono font-semibold">{transfer.amount?.toLocaleString()}</span>
              <span className="text-zinc-700">sent ·</span>
              <span className="text-emerald-400 font-mono">{netReceived(transfer.amount).toLocaleString()}</span>
              <span className="text-zinc-700">rcvd (−20%)</span>
            </div>
          )}
          {transfer.error && (
            <p className="text-[11px] text-red-400 mt-0.5 truncate">{transfer.error}</p>
          )}
          <p className="text-[10px] text-zinc-700 mt-0.5">{timeAgo(transfer.sentAt)}</p>
        </div>

        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${
          transfer.success ? "bg-blue-500/10 text-blue-300" : "bg-red-500/10 text-red-300"
        }`}>
          {transfer.success ? "Sent" : "Failed"}
        </span>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-14 gap-2 text-zinc-600 text-sm">
      <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      Loading…
    </div>
  );
}

function NukeEvents() {
  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch("/api/events?limit=30"),
    refetchInterval: 5000,
  });
  if (isLoading) return <Spinner />;
  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-5 h-5 text-orange-500/50" />
        </div>
        <p className="text-zinc-500 text-sm font-medium">No nuke events yet</p>
        <p className="text-zinc-700 text-xs mt-1">Start the bot to begin monitoring</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {events.map((event: any) => <NukeEventRow key={event.id} event={event} />)}
    </div>
  );
}

function TransferHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => apiFetch("/api/transfers?limit=50"),
    refetchInterval: 5000,
  });
  if (isLoading) return <Spinner />;
  const transfers = data?.transfers ?? [];
  if (transfers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center mx-auto mb-3">
          <ArrowRightLeft className="w-5 h-5 text-blue-500/50" />
        </div>
        <p className="text-zinc-500 text-sm font-medium">No transfers yet</p>
        <p className="text-zinc-700 text-xs mt-1">Use the Transfer tab to send scrap</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {transfers.map((t: any) => <TransferRow key={t.id} transfer={t} />)}
    </div>
  );
}

type ETab = "events" | "transfers";

export default function EventsAndTransfers() {
  const [tab, setTab] = useState<ETab>("events");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-1 bg-[#111118] rounded-xl border border-white/[0.06]">
        {([
          { key: "events" as const, label: "Nuke Events", icon: Zap },
          { key: "transfers" as const, label: "Transfer Log", icon: ArrowRightLeft },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === key
                ? "bg-[#1c1c26] text-white shadow-sm"
                : "text-zinc-600 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      {tab === "events" ? <NukeEvents /> : <TransferHistory />}
    </div>
  );
}
