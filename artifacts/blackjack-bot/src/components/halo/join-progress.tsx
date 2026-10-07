import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { clock } from "@/lib/format";
import { useNow, type JoinJob, type JoinStep } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button, Dot, Panel } from "./ui";

const stepTone = { pending: "off", joining: "connecting", joined: "ok", already: "ok", skipped: "off", error: "bad" } as const;
const stepText = { pending: "Waiting", joining: "Joining", joined: "Joined", already: "Already in", skipped: "Skipped", error: "Failed" } as const;

export function JoinProgress({ job }: { job: JoinJob }) {
  const qc = useQueryClient();
  const now = useNow(!job.done);
  const cancel = useMutation({
    mutationFn: () => apiFetch("/api/servers/join/cancel", { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["bot-status"] }),
  });

  const count = (s: JoinStep["status"]) => job.steps.filter((x) => x.status === s).length;
  const finished = job.steps.filter((s) => s.status !== "pending" && s.status !== "joining").length;
  const pct = job.steps.length ? (finished / job.steps.length) * 100 : 0;
  const multi = job.invites.length > 1;
  const nameOf = (code: string) => job.invites.find((i) => i.code === code)?.name ?? code;

  return (
    <Panel>
      <div className="px-5 pt-4 pb-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[15px] font-semibold min-w-0">
            {job.done ? "Joining finished" : "Joining"}{" "}
            <span className="font-normal text-fg-2">{job.invites.map((i) => i.name).join(", ")}</span>
          </h2>
          {!job.done && (
            <Button size="sm" variant="ghost" busy={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel
            </Button>
          )}
        </div>

        <div className="h-1.5 rounded-full bg-raised overflow-hidden">
          <div className={cn("h-full transition-all duration-700", job.done ? "bg-ok" : "bg-halo")} style={{ width: `${pct}%` }} />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] tabular text-fg-2">
          <span>
            <span className="text-fg font-medium">{count("joined")}</span> joined
          </span>
          {count("already") > 0 && <span>{count("already")} already in</span>}
          {count("error") > 0 && <span className="text-bad">{count("error")} failed</span>}
          {count("skipped") > 0 && <span>{count("skipped")} skipped</span>}
          {!job.done && job.nextAt && (
            <span>
              Next in <span className="text-fg font-medium">{clock(job.nextAt - now)}</span>
            </span>
          )}
        </div>
      </div>

      <ul className="border-t border-line divide-y divide-line max-h-[420px] overflow-y-auto">
        {job.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-2.5 text-[13px]">
            <Dot tone={stepTone[s.status]} className="mt-[6px]" />
            <div className="flex-1 min-w-0">
              <div className="truncate">
                {s.label}
                {multi && <span className="text-fg-3"> · {nameOf(s.invite)}</span>}
              </div>
              {s.error && <div className="text-[12px] text-bad">{s.error}</div>}
            </div>
            <span className={cn("shrink-0 text-right text-[12px]", s.status === "error" ? "text-bad" : "text-fg-3")}>
              {stepText[s.status]}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
