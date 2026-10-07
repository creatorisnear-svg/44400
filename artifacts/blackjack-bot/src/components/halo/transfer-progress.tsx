import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { afterTax, clock, handle, num } from "@/lib/format";
import { useNow, type FillOrder } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button, Dot, Panel } from "./ui";

const stepTone = { pending: "off", sending: "connecting", sent: "ok", skipped: "off", error: "bad" } as const;
const stepText = { pending: "Waiting", sending: "Sending", sent: "Sent", skipped: "Skipped", error: "Failed" } as const;

export function TransferProgress({ order, compact }: { order: FillOrder; compact?: boolean }) {
  const qc = useQueryClient();
  const now = useNow(!order.done);
  const cancel = useMutation({
    mutationFn: () => apiFetch("/api/transfer/fill/cancel", { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });
  const pct = order.totalRequested > 0 ? Math.min(100, (order.totalSent / order.totalRequested) * 100) : 0;

  return (
    <Panel>
      <div className="px-5 pt-4 pb-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[15px] font-semibold">
            {order.done ? "Transfer finished" : "Transfer running"}{" "}
            <span className="font-normal text-fg-2">to {handle(order.toUsername)}</span>
          </h2>
          {!order.done && (
            <Button size="sm" variant="ghost" busy={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel
            </Button>
          )}
        </div>

        <div className="h-1.5 rounded-full bg-raised overflow-hidden">
          <div className={cn("h-full transition-all duration-700", order.done ? "bg-ok" : "bg-gold")} style={{ width: `${pct}%` }} />
        </div>

        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-[13px] tabular">
          <span className="text-fg-2">
            <span className="text-fg font-medium">{num(order.totalSent)}</span> of {num(order.totalRequested)} sent
          </span>
          <span className="text-fg-2">
            They get <span className="text-ok font-medium">{num(afterTax(order.totalSent))}</span>
          </span>
          {!order.done && order.nextSendAt && (
            <span className="text-fg-2">
              Next in <span className="text-fg font-medium">{clock(order.nextSendAt - now)}</span>
            </span>
          )}
        </div>
      </div>

      {!compact && order.steps.length > 0 && (
        <ul className="border-t border-line divide-y divide-line">
          {order.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <Dot tone={stepTone[s.status]} />
              <span className="flex-1 min-w-0 truncate">{s.label}</span>
              <span className="tabular text-fg-2">{num(s.amount)}</span>
              <span className={cn("w-16 text-right text-[12px]", s.status === "error" ? "text-bad" : "text-fg-3")} title={s.error}>
                {stepText[s.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
