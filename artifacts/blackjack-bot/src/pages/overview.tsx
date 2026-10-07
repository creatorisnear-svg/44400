import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { clock, duration, num } from "@/lib/format";
import { useAccounts, useLogs, useNow, useStatus, type LogLine } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { SetupSteps } from "@/components/halo/setup";
import { TransferProgress } from "@/components/halo/transfer-progress";
import { ConnectionLabel, Dot, Figure, Panel, Segmented } from "@/components/halo/ui";

type Kind = "nuke" | "claim" | "transfer" | "warn" | "error" | "info";
type Filter = "all" | "claims" | "transfers" | "problems";

// Server log lines carry emoji and check marks; the dot already says what kind of line it is.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}✓✔✗✘]/gu;

function kindOf(l: LogLine): Kind {
  if (l.level === "error") return "error";
  if (l.level === "warn") return "warn";
  const m = l.message;
  if (/NUKE DETECTED|Nuke claimed by/i.test(m)) return "nuke";
  if (/claimed!/i.test(m)) return "claim";
  if (/transfer|fill order|Sent .* →/i.test(m)) return "transfer";
  return "info";
}

const kindTone: Record<Kind, string> = {
  nuke: "halo",
  claim: "ok",
  transfer: "off",
  warn: "warn",
  error: "bad",
  info: "off",
};

const matches: Record<Filter, (k: Kind) => boolean> = {
  all: () => true,
  claims: (k) => k === "nuke" || k === "claim",
  transfers: (k) => k === "transfer",
  problems: (k) => k === "warn" || k === "error",
};

function LogRow({ line }: { line: LogLine & { kind: Kind } }) {
  const text = line.message.replace(EMOJI, "").replace(/\s*in <#\d+>/, "").replace(/\s{2,}/g, " ").trim();
  const m = text.match(/^\[([^\]]+)\]\s*(.*)$/);
  const who = m?.[1];
  const rest = m ? m[2] : text;
  const time = new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className={cn("flex gap-3 px-4 py-1.5 text-[13px] leading-relaxed", line.kind === "nuke" && "bg-halo/[0.06]")}>
      <span className="font-mono text-[12px] text-fg-3 shrink-0 pt-px tabular">{time}</span>
      <Dot tone={kindTone[line.kind]} className="mt-[7px]" />
      <span
        className={cn(
          "min-w-0 break-words",
          line.kind === "error" ? "text-bad" : line.kind === "warn" ? "text-warn" : line.kind === "nuke" ? "text-halo font-medium" : line.kind === "claim" ? "text-fg" : "text-fg-2",
        )}
      >
        {who && <span className="text-fg font-medium">{who} </span>}
        {rest}
      </span>
    </div>
  );
}

function Activity() {
  const { data } = useLogs();
  const [filter, setFilter] = useState<Filter>("all");
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  const lines = useMemo(
    () => (data?.logs ?? []).filter((l) => l.level !== "debug").map((l) => ({ ...l, kind: kindOf(l) })).filter((l) => matches[filter](l.kind)),
    [data, filter],
  );

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, follow]);

  return (
    <Panel className="flex flex-col min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <h2 className="text-[15px] font-semibold">Activity</h2>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "claims", label: "Claims" },
            { value: "transfers", label: "Transfers" },
            { value: "problems", label: "Problems" },
          ]}
        />
      </div>
      <div className="relative">
        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
          }}
          className="h-[52vh] min-h-[320px] overflow-y-auto py-2"
        >
          {lines.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-fg-3">
              {filter === "all" ? "Nothing yet. Start Halo and this fills up." : "Nothing here yet."}
            </p>
          ) : (
            lines.map((l, i) => <LogRow key={`${l.timestamp}-${i}`} line={l} />)
          )}
        </div>
        {!follow && lines.length > 0 && (
          <button
            onClick={() => setFollow(true)}
            className="absolute bottom-3 right-4 h-8 px-3 rounded-md bg-raised border border-line-strong text-[12px] text-fg-2 hover:text-fg"
          >
            Jump to latest
          </button>
        )}
      </div>
    </Panel>
  );
}

function AccountsGlance() {
  const { data } = useAccounts();
  const accounts = data?.accounts ?? [];
  const shown = accounts.slice(0, 10);
  return (
    <Panel className="min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h2 className="text-[15px] font-semibold">Accounts</h2>
        <Link href="/accounts" className="text-[13px] text-fg-2 hover:text-fg">Manage</Link>
      </div>
      {accounts.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-fg-3">None yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((a) => (
            <li key={a.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{a.label}</div>
                <ConnectionLabel status={a.connectionStatus} enabled={a.enabled} />
              </div>
              <span className="text-[13px] tabular text-fg-2">{num(a.balance)}</span>
            </li>
          ))}
          {accounts.length > shown.length && (
            <li className="px-4 py-2.5 text-[13px] text-fg-3">
              <Link href="/accounts" className="hover:text-fg-2">and {accounts.length - shown.length} more</Link>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

export default function Overview() {
  const { data: status } = useStatus();
  const { data: accountsData } = useAccounts();
  const now = useNow(!!status?.nextAutoTransferAt);
  const accounts = accountsData?.accounts ?? [];
  const balance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const running = status?.running ?? false;

  return (
    <div className="space-y-5">
      <SetupSteps />

      <Panel className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line overflow-hidden">
        <Figure label="Claims since start" value={num(status?.totalClaimsToday)} sub={running ? "this run" : "stopped"} />
        <Figure label="Points since start" value={num(status?.totalScrapToday)} tone="halo" sub="clover points" />
        <Figure
          label="Balance, all accounts"
          value={num(balance)}
          sub={`${accounts.filter((a) => a.balance > 0).length} of ${accounts.length} holding points`}
        />
        {status?.nextAutoTransferAt ? (
          <Figure label="Next auto-transfer" value={clock(status.nextAutoTransferAt - now)} sub="minutes:seconds" />
        ) : (
          <Figure label="Running for" value={running ? duration(status?.uptime ?? 0) : "–"} sub={running ? "since last start" : "not running"} />
        )}
      </Panel>

      {status?.fillOrder && <TransferProgress order={status.fillOrder} compact />}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <Activity />
        <AccountsGlance />
      </div>
    </div>
  );
}
