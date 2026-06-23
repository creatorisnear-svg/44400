import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardContent className="pt-4 pb-4">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="text-orange-400 shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-white">Nuclear Fallout!</span>
              <Badge
                className={`text-xs ${
                  successCount === totalAccounts
                    ? "bg-green-900 text-green-300"
                    : successCount > 0
                      ? "bg-yellow-900 text-yellow-300"
                      : "bg-red-900 text-red-300"
                }`}
              >
                {successCount}/{totalAccounts} claimed
              </Badge>
              <span className="text-xs text-gray-500">{timeAgo(event.detectedAt)}</span>
            </div>
            <div className="flex gap-4 mt-1 text-xs text-gray-500">
              <span>
                Total scrap:{" "}
                <span className="text-yellow-400 font-medium">
                  +{event.totalScrapClaimed?.toLocaleString()}
                </span>
              </span>
              <span className="font-mono text-gray-600">msg:{event.messageId?.slice(-6)}</span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
          )}
        </div>

        {expanded && event.claims?.length > 0 && (
          <div className="mt-3 border-t border-gray-800 pt-3 space-y-1.5">
            {event.claims.map((claim: any) => (
              <div key={claim.accountId} className="flex items-center gap-2 text-xs">
                {claim.success ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className="text-gray-300 flex-1">
                  {claim.label ?? `Account #${claim.accountId}`}
                </span>
                {claim.success ? (
                  <span className="text-green-400">+{claim.scrapGained?.toLocaleString()}</span>
                ) : (
                  <span className="text-red-400 truncate max-w-48">{claim.error ?? "Failed"}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransferRow({ transfer }: { transfer: any }) {
  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardContent className="py-3">
        <div className="flex items-center gap-3">
          <div className={`shrink-0 ${transfer.success ? "text-blue-400" : "text-red-400"}`}>
            {transfer.success ? (
              <ArrowRightLeft className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-300">
                <span className="text-white font-medium">{transfer.fromLabel ?? `#${transfer.fromAccountId}`}</span>
                {" → "}
                <span className="text-blue-300">@{transfer.toUsername}</span>
              </span>
              <span
                className={`text-sm font-bold ${transfer.success ? "text-blue-400" : "text-red-400"}`}
              >
                {transfer.success ? `${transfer.amount?.toLocaleString()}` : "Failed"}
              </span>
            </div>
            {transfer.error && (
              <p className="text-xs text-red-400 mt-0.5 truncate">{transfer.error}</p>
            )}
            <p className="text-xs text-gray-600 mt-0.5">{timeAgo(transfer.sentAt)}</p>
          </div>
          {transfer.success ? (
            <Badge className="bg-green-900 text-green-300 text-xs shrink-0">Sent</Badge>
          ) : (
            <Badge className="bg-red-900 text-red-300 text-xs shrink-0">Failed</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NukeEvents() {
  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch("/api/events?limit=30"),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="text-gray-500 text-sm py-4">Loading events...</div>;
  }

  const events = data?.events ?? [];

  if (events.length === 0) {
    return (
      <div className="text-center text-gray-600 py-12">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No nuke events yet. Start the bot to begin monitoring.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event: any) => (
        <NukeEventRow key={event.id} event={event} />
      ))}
    </div>
  );
}

function TransferHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => apiFetch("/api/transfers?limit=50"),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="text-gray-500 text-sm py-4">Loading transfers...</div>;
  }

  const transfers = data?.transfers ?? [];

  if (transfers.length === 0) {
    return (
      <div className="text-center text-gray-600 py-12">
        <ArrowRightLeft className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No transfers yet. Use the Transfer tab to send scrap.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transfers.map((t: any) => (
        <TransferRow key={t.id} transfer={t} />
      ))}
    </div>
  );
}

export default function EventsAndTransfers() {
  return (
    <Tabs defaultValue="events">
      <TabsList className="bg-gray-800 border border-gray-700 mb-4">
        <TabsTrigger value="events" className="data-[state=active]:bg-gray-700">
          <Zap className="w-3.5 h-3.5 mr-1" />
          Nuke Events
        </TabsTrigger>
        <TabsTrigger value="transfers" className="data-[state=active]:bg-gray-700">
          <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
          Transfer Log
        </TabsTrigger>
      </TabsList>
      <TabsContent value="events">
        <NukeEvents />
      </TabsContent>
      <TabsContent value="transfers">
        <TransferHistory />
      </TabsContent>
    </Tabs>
  );
}
