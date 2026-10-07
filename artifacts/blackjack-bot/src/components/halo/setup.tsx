import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useBotControl, useSettings, useSetupState } from "@/lib/hooks";
import { AddOneAccount } from "./add-account";
import { WatchPicker, type WatchValue } from "./watch-picker";
import { Button, Notice, Panel } from "./ui";

function Step({
  n,
  title,
  done,
  current,
  summary,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  current: boolean;
  summary?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span
        className={cn(
          "mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-semibold tabular",
          done ? "bg-ok/15 text-ok" : current ? "border border-gold text-gold" : "border border-line-strong text-fg-3",
        )}
      >
        {done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : n}
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn("text-[15px] font-medium", done || current ? "text-fg" : "text-fg-3")}>{title}</div>
        {summary && <div className="mt-0.5 text-[13px] text-fg-2">{summary}</div>}
        {current && children && <div className="mt-4 max-w-xl">{children}</div>}
      </div>
    </li>
  );
}

function WatchStep() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [value, setValue] = useState<WatchValue>({ serverId: "", channelId: "", cloverId: "" });

  useEffect(() => {
    if (settings) setValue({ serverId: settings.serverId, channelId: settings.channelId, cloverId: settings.cloverId });
  }, [settings]);

  const onChange = useCallback((p: Partial<WatchValue>) => setValue((v) => ({ ...v, ...p })), []);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/bot/settings", { method: "PUT", body: JSON.stringify(value) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-settings"] }),
  });

  return (
    <div className="space-y-4">
      <WatchPicker value={value} onChange={onChange} />
      {save.error && <Notice tone="bad">{(save.error as Error).message}</Notice>}
      <Button variant="primary" busy={save.isPending} disabled={!value.serverId || !value.channelId} onClick={() => save.mutate()}>
        Save and continue
      </Button>
    </div>
  );
}

/** First-run checklist. Disappears once Halo is running. */
export function SetupSteps() {
  const { loading, hasAccount, hasWatch, running } = useSetupState();
  const { start } = useBotControl();

  if (loading || running) return null;
  const doneCount = Number(hasAccount) + Number(hasWatch);
  const current = !hasAccount ? 1 : !hasWatch ? 2 : 3;

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
        <h2 className="text-[15px] font-semibold">{current === 3 ? "Ready to go" : "Set up Halo"}</h2>
        <span className="text-[12px] text-fg-3 tabular">{doneCount} of 3 done</span>
      </div>
      <ol className="divide-y divide-line">
        <Step
          n={1}
          title="Add an account"
          done={hasAccount}
          current={current === 1}
          summary={current === 1 ? "Paste the Discord token of an account that should claim nukes." : undefined}
        >
          <AddOneAccount />
          <p className="mt-3 text-[12px] text-fg-3">
            Have a stack of them? Add them all at once on the <Link href="/accounts" className="underline underline-offset-4 hover:text-fg-2">Accounts</Link> page.
          </p>
        </Step>
        <Step
          n={2}
          title="Choose the nuke channel"
          done={hasWatch}
          current={current === 2}
          summary={current === 2 ? "Pick the server and channel where the game bot drops nukes." : undefined}
        >
          <WatchStep />
        </Step>
        <Step
          n={3}
          title="Start Halo"
          done={false}
          current={current === 3}
          summary={current === 3 ? "Every account connects and starts watching. Points can go to one person automatically; set that in Settings." : undefined}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" busy={start.isPending} onClick={() => start.mutate()}>
              Start Halo
            </Button>
            <Link href="/settings" className="text-[13px] text-fg-2 underline underline-offset-4 hover:text-fg">
              Where points go
            </Link>
          </div>
          {start.error && <Notice tone="bad" className="mt-3">{(start.error as Error).message}</Notice>}
        </Step>
      </ol>
    </Panel>
  );
}
