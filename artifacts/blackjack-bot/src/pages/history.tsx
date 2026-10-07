import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { afterTax, handle, num, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dot, PageHeader, Panel, Segmented, Spinner } from "@/components/halo/ui";

interface Claim {
  accountId: number;
  label: string | null;
  success: boolean;
  scrapGained: number;
  error: string | null;
}

interface NukeEvent {
  id: number;
  messageId: string;
  detectedAt: string;
  totalScrapClaimed: number;
  claims: Claim[];
}

interface TransferLog {
  id: number;
  fromAccountId: number;
  fromLabel: string | null;
  toUsername: string;
  amount: number;
  success: boolean;
  error: string | null;
  sentAt: string;
}

function NukeRow({ event }: { event: NukeEvent }) {
  const [open, setOpen] = useState(false);
  const ok = event.claims.filter((c) => c.success).length;
  const skipped = event.claims.filter((c) => c.error === "skipped").length;
  const total = event.claims.length;
  const tone = total === 0 ? "off" : ok === total - skipped ? "ok" : ok > 0 ? "warn" : "bad";

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-raised/60 transition-colors"
        aria-expanded={open}
      >
        <Dot tone={tone} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Nuclear Fallout</div>
          <div className="text-[12px] text-fg-3 tabular">
            {timeAgo(event.detectedAt)} · {ok} of {total} claimed{skipped ? ` · ${skipped} skipped` : ""}
          </div>
        </div>
        <span className={cn("text-sm tabular font-medium", event.totalScrapClaimed > 0 ? "text-gold" : "text-fg-3")}>
          +{num(event.totalScrapClaimed)}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="pb-3 pl-[38px] pr-4 space-y-1">
          {event.claims.length === 0 && <li className="text-[13px] text-fg-3">No account tried this one.</li>}
          {event.claims.map((c) => (
            <li key={c.accountId} className="flex items-center gap-3 text-[13px]">
              <span className="flex-1 min-w-0 truncate text-fg-2">{c.label ?? `Account ${c.accountId}`}</span>
              {c.success ? (
                <span className="tabular text-ok">+{num(c.scrapGained)}</span>
              ) : (
                <span className={cn("truncate max-w-[60%]", c.error === "skipped" ? "text-fg-3" : "text-bad")} title={c.error ?? undefined}>
                  {c.error === "skipped" ? "Skipped" : c.error ?? "Failed"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Nukes() {
  const { data, isLoading } = useQuery<{ events: NukeEvent[] }>({
    queryKey: ["events"],
    queryFn: () => apiFetch("/api/events?limit=50"),
    refetchInterval: 5000,
  });
  if (isLoading) return <Spinner />;
  const events = data?.events ?? [];
  if (events.length === 0) {
    return <Panel className="px-5 py-6 text-[13px] text-fg-3">No nukes caught yet. They show up here as soon as one drops.</Panel>;
  }
  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-line">
        {events.map((e) => <NukeRow key={e.id} event={e} />)}
      </ul>
    </Panel>
  );
}

function Transfers() {
  const { data, isLoading } = useQuery<{ transfers: TransferLog[] }>({
    queryKey: ["transfers"],
    queryFn: () => apiFetch("/api/transfers?limit=100"),
    refetchInterval: 5000,
  });
  if (isLoading) return <Spinner />;
  const transfers = data?.transfers ?? [];
  if (transfers.length === 0) {
    return <Panel className="px-5 py-6 text-[13px] text-fg-3">No transfers yet.</Panel>;
  }
  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-line">
        {transfers.map((t) => (
          <li key={t.id} className="px-4 py-3 flex items-center gap-3">
            <Dot tone={t.success ? "ok" : "bad"} />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">
                <span className="font-medium">{t.fromLabel ?? `Account ${t.fromAccountId}`}</span>
                <span className="text-fg-3"> to </span>
                <span className="text-fg-2">{handle(t.toUsername)}</span>
              </div>
              <div className={cn("text-[12px] truncate", t.success ? "text-fg-3" : "text-bad")} title={t.error ?? undefined}>
                {timeAgo(t.sentAt)}
                {t.success ? ` · they got ${num(afterTax(t.amount))}` : ` · ${t.error ?? "Failed"}`}
              </div>
            </div>
            <span className={cn("text-sm tabular", t.success ? "text-fg" : "text-fg-3 line-through")}>{num(t.amount)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function History() {
  const [tab, setTab] = useState<"nukes" | "transfers">("nukes");
  return (
    <div className="space-y-5">
      <PageHeader
        title="History"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "nukes", label: "Nukes" },
              { value: "transfers", label: "Transfers" },
            ]}
          />
        }
      />
      {tab === "nukes" ? <Nukes /> : <Transfers />}
    </div>
  );
}
