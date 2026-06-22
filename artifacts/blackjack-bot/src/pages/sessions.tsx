import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

function resultBadge(result: string | null) {
  if (!result) return <Badge variant="outline" className="text-gray-500">Pending</Badge>;
  const map: Record<string, string> = {
    win: "bg-green-900 text-green-300",
    blackjack: "bg-yellow-900 text-yellow-300",
    loss: "bg-red-900 text-red-300",
    bust: "bg-red-900 text-red-300",
    push: "bg-gray-700 text-gray-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[result] ?? "bg-gray-800 text-gray-400"}`}>
      {result}
    </span>
  );
}

function HandRow({ hand }: { hand: any }) {
  return (
    <div className="flex items-center gap-4 text-sm py-2 border-b border-gray-800 last:border-0">
      <span className="text-gray-500 text-xs w-16 shrink-0">
        {new Date(hand.playedAt).toLocaleTimeString()}
      </span>
      {resultBadge(hand.result)}
      <span className="text-gray-400">Bet: <span className="text-white">{hand.bet}</span></span>
      {hand.scrapDelta !== null && (
        <span className={hand.scrapDelta >= 0 ? "text-green-400" : "text-red-400"}>
          {hand.scrapDelta >= 0 ? "+" : ""}{hand.scrapDelta}
        </span>
      )}
      {hand.playerCards?.length > 0 && (
        <span className="text-gray-500 text-xs">
          [{hand.playerCards.join(", ")}] vs [{hand.dealerCards?.join(", ") ?? "?"}]
        </span>
      )}
      {hand.actions?.length > 0 && (
        <span className="text-gray-600 text-xs">{hand.actions.join(" → ")}</span>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: any }) {
  const [expanded, setExpanded] = useState(false);
  const { data: handsData } = useQuery({
    queryKey: ["session-hands", session.id],
    queryFn: () => apiFetch(`/api/sessions/${session.id}/hands?limit=50`),
    enabled: expanded,
  });

  const winRate = session.totalHands > 0
    ? ((session.wins / session.totalHands) * 100).toFixed(1)
    : "0.0";

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardContent className="pt-4 pb-4">
        <div
          className="flex items-center gap-4 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-300 font-medium">
                Session #{session.id}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  session.status === "active"
                    ? "bg-green-900 text-green-300"
                    : session.status === "error"
                      ? "bg-red-900 text-red-300"
                      : "bg-gray-800 text-gray-400"
                }`}
              >
                {session.status}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(session.startedAt).toLocaleString()}
                {session.endedAt &&
                  ` → ${new Date(session.endedAt).toLocaleTimeString()}`}
              </span>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
              <span>
                Hands:{" "}
                <span className="text-white">{session.totalHands}</span>
              </span>
              <span>
                W:{" "}
                <span className="text-green-400">{session.wins}</span>
              </span>
              <span>
                L:{" "}
                <span className="text-red-400">{session.losses}</span>
              </span>
              <span>
                Win Rate:{" "}
                <span className="text-white">{winRate}%</span>
              </span>
              <span>
                Net:{" "}
                <span
                  className={session.scrapNet >= 0 ? "text-green-400" : "text-red-400"}
                >
                  {session.scrapNet >= 0 ? "+" : ""}
                  {session.scrapNet}
                </span>
              </span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {expanded && (
          <div className="mt-4 border-t border-gray-800 pt-4">
            {!handsData ? (
              <p className="text-gray-600 text-sm">Loading...</p>
            ) : handsData.hands.length === 0 ? (
              <p className="text-gray-600 text-sm">No hands recorded for this session.</p>
            ) : (
              <div>
                {handsData.hands.map((hand: any) => (
                  <HandRow key={hand.id} hand={hand} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SessionHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => apiFetch("/api/sessions?limit=20"),
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <div className="text-gray-500 text-sm py-4">Loading sessions...</div>;
  }

  const sessions = data?.sessions ?? [];

  if (sessions.length === 0) {
    return (
      <div className="text-center text-gray-600 py-12">
        <p>No sessions yet. Start the bot to begin playing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session: any) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </div>
  );
}
