import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAccounts, useBotControl, useServers, useSetupState, useStatus } from "@/lib/hooks";
import { JoinProgress } from "@/components/halo/join-progress";
import { Button, ConnectionLabel, Field, Notice, PageHeader, Panel, Segmented, Textarea } from "@/components/halo/ui";

type Pace = "careful" | "quick";

// Seconds between accounts; must match runJoinJob in the API server.
const PACE: Record<Pace, { min: number; max: number }> = {
  careful: { min: 20, max: 45 },
  quick: { min: 5, max: 10 },
};

function estimate(joins: number, pace: Pace) {
  const { min, max } = PACE[pace];
  const secs = Math.max(0, joins - 1) * ((min + max) / 2);
  return secs < 90 ? "under 2 min" : `about ${Math.round(secs / 60)} min`;
}

function Offline() {
  const { start } = useBotControl();
  const { ready } = useSetupState();
  return (
    <Panel className="px-5 py-4 space-y-3">
      <p className="text-[13px] text-fg">Your accounts are offline.</p>
      <p className="text-[13px] text-fg-2 leading-relaxed">
        Start Halo to bring them online. The nuke scraper starts with it and keeps running while you use this tab.
      </p>
      {ready ? (
        <Button variant="primary" busy={start.isPending} onClick={() => start.mutate()}>
          Start Halo
        </Button>
      ) : (
        <Notice>
          Finish setup on the{" "}
          <Link href="/" className="underline underline-offset-4">
            Nuke scraper
          </Link>{" "}
          tab first.
        </Notice>
      )}
      {start.error && <Notice tone="bad">{(start.error as Error).message}</Notice>}
    </Panel>
  );
}

function ServerList({ labels }: { labels: Map<number, string> }) {
  const { data } = useServers();
  if (!data || data.online === 0) return null;

  return (
    <Panel>
      <div className="px-5 py-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Servers your accounts are in</h2>
        <span className="text-[12px] text-fg-3 tabular">
          {data.online} account{data.online === 1 ? "" : "s"} online
        </span>
      </div>
      {data.servers.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-[13px] text-fg-3">None yet.</p>
      ) : (
        <ul className="border-t border-line divide-y divide-line max-h-[480px] overflow-y-auto">
          {data.servers.map((s) => {
            const missing = [...labels.entries()].filter(([id]) => !s.accountIds.includes(id)).map(([, l]) => l);
            const all = s.accountIds.length >= data.online;
            return (
              <li key={s.id} className="flex items-start gap-4 px-5 py-2.5 text-[13px]">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.name}</div>
                  {!all && missing.length > 0 && (
                    <div className="text-[12px] text-fg-3 truncate">
                      Not in: {missing.length <= 4 ? missing.join(", ") : `${missing.length} accounts`}
                    </div>
                  )}
                </div>
                <span className={all ? "text-ok tabular shrink-0" : "text-fg-2 tabular shrink-0"}>
                  {s.accountIds.length} of {data.online}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default function JoinServers() {
  const qc = useQueryClient();
  const { data: status } = useStatus();
  const { data: accountsData } = useAccounts();
  const [text, setText] = useState("");
  const [who, setWho] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pace, setPace] = useState<Pace>("careful");

  const running = status?.running ?? false;
  const job = status?.joinJob ?? null;
  const active = !!job && !job.done;
  const accounts = (accountsData?.accounts ?? []).filter((a) => a.enabled);
  const online = accounts.filter((a) => a.connectionStatus === "connected");
  const invites = text.split(/[\s,]+/).filter(Boolean);
  const chosen = who === "all" ? online : online.filter((a) => picked.has(a.id));
  const onlineLabels = new Map(online.map((a) => [a.id, a.label]));

  const join = useMutation({
    mutationFn: () =>
      apiFetch("/api/servers/join", {
        method: "POST",
        body: JSON.stringify({ invites, accountIds: who === "all" ? null : chosen.map((a) => a.id), pace }),
      }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["bot-status"] });
    },
  });

  const toggle = (id: number) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        title="Join servers"
        sub="Put your accounts in a server. They join one at a time with a pause in between."
      />

      {job && <JoinProgress job={job} />}

      {!running && <Offline />}

      {running && !active && (
        <Panel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (invites.length && chosen.length) join.mutate();
            }}
            className="p-5 space-y-5"
          >
            <Field label="Invite" hint="Full link like discord.gg/abc or just the code. Several? One per line.">
              <Textarea
                rows={2}
                spellCheck={false}
                className="font-mono text-[13px]"
                placeholder="discord.gg/example"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>

            <Field label="Accounts">
              <div className="space-y-3">
                <Segmented
                  value={who}
                  onChange={(v) => {
                    // Start from everyone ticked; leaving a few out is the usual case.
                    if (v === "pick" && picked.size === 0) setPicked(new Set(online.map((a) => a.id)));
                    setWho(v);
                  }}
                  options={[
                    { value: "all", label: `All online (${online.length})` },
                    { value: "pick", label: "Choose" },
                  ]}
                />
                {who === "pick" && (
                  <ul className="rounded-md border border-line divide-y divide-line max-h-72 overflow-y-auto">
                    {accounts.map((a) => {
                      const isOnline = a.connectionStatus === "connected";
                      return (
                        <li key={a.id}>
                          <label className={isOnline ? "flex items-center gap-3 px-3 py-2 text-[13px] cursor-pointer hover:bg-raised" : "flex items-center gap-3 px-3 py-2 text-[13px] opacity-50"}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-halo"
                              disabled={!isOnline}
                              checked={isOnline && picked.has(a.id)}
                              onChange={() => toggle(a.id)}
                            />
                            <span className="flex-1 min-w-0 truncate">{a.label}</span>
                            <ConnectionLabel status={a.connectionStatus} />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Field>

            <Field
              label="Speed"
              hint={
                pace === "careful"
                  ? "Waits 20 to 45 seconds between accounts. Safest."
                  : "Waits 5 to 10 seconds. Discord is more likely to ask for a captcha or lock an account."
              }
            >
              <Segmented
                value={pace}
                onChange={setPace}
                options={[
                  { value: "careful", label: "Careful" },
                  { value: "quick", label: "Quick" },
                ]}
              />
            </Field>

            {join.error && <Notice tone="bad">{(join.error as Error).message}</Notice>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="lg" busy={join.isPending} disabled={!invites.length || !chosen.length}>
                Join with {chosen.length} account{chosen.length === 1 ? "" : "s"}
              </Button>
              {invites.length > 0 && chosen.length > 0 && (
                <span className="text-[12px] text-fg-3">Takes {estimate(invites.length * chosen.length, pace)}.</span>
              )}
            </div>
          </form>
        </Panel>
      )}

      {running && <ServerList labels={onlineLabels} />}

      <p className="text-[13px] text-fg-3 leading-relaxed">
        Accounts also join the invites listed under{" "}
        <Link href="/settings" className="underline underline-offset-4 hover:text-fg-2">
          Auto-join servers
        </Link>{" "}
        whenever they come online.
      </p>
    </div>
  );
}
