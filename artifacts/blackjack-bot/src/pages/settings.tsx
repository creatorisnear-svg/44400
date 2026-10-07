import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, clearToken } from "@/lib/api";
import { useBotControl, useSettings, useStatus, type BotSettings } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChannelSelect, WatchPicker, type WatchValue } from "@/components/halo/watch-picker";
import { Button, Field, Input, Notice, PageHeader, Panel, Segmented, Spinner, Textarea, Toggle } from "@/components/halo/ui";

type Form = Omit<BotSettings, "id" | "autoJoinServers">;

const FIELDS: (keyof Form)[] = [
  "serverId", "channelId", "cloverId", "cloverPrefix", "nukeKeywords", "giveCommand",
  "claimDelayMin", "claimDelayMax", "transferServer", "transferChannelId",
  "autoTransferEnabled", "autoTransferRecipient", "autoTransferIntervalMin", "humanize", "skipRate",
];

function pick(s: BotSettings): Form {
  return Object.fromEntries(FIELDS.map((k) => [k, s[k]])) as Form;
}

function invitesToText(json: string): string {
  try {
    const list = JSON.parse(json || "[]");
    return Array.isArray(list) ? list.join("\n") : "";
  } catch {
    return "";
  }
}

function textToInvites(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim().match(/(?:discord(?:app)?\.(?:gg|com\/invite)\/)?([A-Za-z0-9-]+)\/?$/)?.[1] ?? "")
    .filter(Boolean);
}

function Section({ title, desc, children, aside }: { title: string; desc?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Panel className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-x-8 gap-y-4 p-5">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-[13px] text-fg-2 leading-relaxed">{desc}</p>}
        {aside}
      </div>
      <div className="space-y-5 max-w-lg">{children}</div>
    </Panel>
  );
}

const int = (v: string, min = 0, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(min, Math.floor(Number(v.replace(/[^\d]/g, "")) || 0)));

export default function Settings() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: status } = useStatus();
  const { restart } = useBotControl();
  const [form, setForm] = useState<Form | null>(null);
  const [joinText, setJoinText] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  const reset = useCallback(() => {
    if (!settings) return;
    setForm(pick(settings));
    setJoinText(invitesToText(settings.autoJoinServers));
  }, [settings]);

  useEffect(() => {
    if (settings && !form) reset();
  }, [settings, form, reset]);

  const set = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f)), []);
  const setWatch = useCallback(
    (p: Partial<WatchValue>) =>
      setForm((f) => {
        if (!f) return f;
        // A transfer channel from another server would never work.
        const serverChanged = p.serverId !== undefined && p.serverId !== f.serverId;
        return { ...f, ...p, ...(serverChanged ? { transferChannelId: "" } : {}) };
      }),
    [],
  );

  const dirty = useMemo(() => {
    if (!settings || !form) return false;
    const base = pick(settings);
    return (
      FIELDS.some((k) => base[k] !== form[k]) ||
      JSON.stringify(textToInvites(joinText)) !== JSON.stringify(textToInvites(invitesToText(settings.autoJoinServers)))
    );
  }, [settings, form, joinText]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/api/bot/settings", {
        method: "PUT",
        body: JSON.stringify({ ...form, autoJoinServers: JSON.stringify(textToInvites(joinText)) }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bot-settings"] });
      const fresh = qc.getQueryData<BotSettings>(["bot-settings"]);
      if (fresh) {
        setForm(pick(fresh));
        setJoinText(invitesToText(fresh.autoJoinServers));
      }
      if (status?.running) setNeedsRestart(true);
    },
  });

  if (isLoading || !form) return <Spinner />;

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      {needsRestart && status?.running && (
        <Panel className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-gold/40">
          <span className="text-[13px]">Saved. Restart Halo so every account picks up the new settings.</span>
          <Button
            variant="primary"
            size="sm"
            busy={restart.isPending}
            onClick={() => restart.mutate(undefined, { onSuccess: () => setNeedsRestart(false) })}
          >
            Restart now
          </Button>
        </Panel>
      )}

      <Section title="Where to watch" desc="The channel where the game bot drops nukes. The lists come from your first account's servers.">
        <WatchPicker value={{ serverId: form.serverId, channelId: form.channelId, cloverId: form.cloverId }} onChange={setWatch} />
      </Section>

      <Section title="Payouts" desc="Where the points your accounts collect end up.">
        <Field label="Send points to" hint="Discord username or user ID. Also filled in for you on the Transfer page.">
          <Input
            value={form.autoTransferRecipient}
            placeholder="username"
            onChange={(e) => set("autoTransferRecipient", e.target.value.replace(/^@/, ""))}
          />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Toggle checked={form.autoTransferEnabled} onChange={(v) => set("autoTransferEnabled", v)} label="Send automatically" />
            <span className="text-[13px] text-fg">Send balances automatically</span>
          </div>
          <Field
            label="Minutes between sends"
            hint="Halo waits this long between each account's transfer, and between rounds. Manual transfers use it too."
          >
            <Input
              inputMode="numeric"
              className="w-28 tabular"
              value={String(form.autoTransferIntervalMin)}
              onChange={(e) => set("autoTransferIntervalMin", int(e.target.value, 1, 1440))}
            />
          </Field>
        </div>

        <Field label="Transfer channel" hint="Where the transfer command is sent.">
          <ChannelSelect
            serverId={form.serverId}
            value={form.transferChannelId}
            onChange={(id) => set("transferChannelId", id)}
            emptyLabel="Same as the nuke channel"
          />
        </Field>

        <Field label="Game server" hint="Which game server points are claimed and sent on.">
          <Segmented
            value={String(form.transferServer)}
            onChange={(v) => set("transferServer", Number(v))}
            options={[1, 2, 3].map((n) => ({ value: String(n), label: `Server ${n}` }))}
          />
        </Field>
      </Section>

      <Section title="Auto-join servers" desc="When an account connects it joins these servers and links its in-game name with the game bot.">
        <Field label="Invites" hint="One per line. Full links like discord.gg/abc or just the code. Accounts need an in-game name to link.">
          <Textarea
            rows={4}
            spellCheck={false}
            className="font-mono text-[13px]"
            placeholder={"discord.gg/example\nInviteCode123"}
            value={joinText}
            onChange={(e) => setJoinText(e.target.value)}
          />
        </Field>
      </Section>

      <Section
        title="Advanced"
        desc="Detection and timing. The defaults work for Clover."
        aside={
          <button
            type="button"
            className="mt-3 text-[13px] text-fg-2 underline underline-offset-4 hover:text-fg"
            onClick={() => setAdvanced((v) => !v)}
          >
            {advanced ? "Hide" : "Show"} advanced settings
          </button>
        }
      >
        {!advanced ? (
          <p className="text-[13px] text-fg-3 md:pt-1">Keywords, command names, delays and human mode.</p>
        ) : (
          <>
            <Field label="Nuke keywords" hint="Comma separated. A game bot message with any of these is a nuke.">
              <Input value={form.nukeKeywords} onChange={(e) => set("nukeKeywords", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Game bot prefix">
                <Input className="font-mono" value={form.cloverPrefix} onChange={(e) => set("cloverPrefix", e.target.value)} />
              </Field>
              <Field label="Transfer command">
                <Input className="font-mono" value={form.giveCommand} onChange={(e) => set("giveCommand", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Claim delay, shortest (ms)">
                <Input inputMode="numeric" className="tabular" value={String(form.claimDelayMin)} onChange={(e) => set("claimDelayMin", int(e.target.value))} />
              </Field>
              <Field label="Claim delay, longest (ms)">
                <Input inputMode="numeric" className="tabular" value={String(form.claimDelayMax)} onChange={(e) => set("claimDelayMax", int(e.target.value))} />
              </Field>
            </div>
            {form.claimDelayMax < form.claimDelayMin && <Notice tone="warn">The longest delay is shorter than the shortest.</Notice>}
            <div className="flex items-start gap-3">
              <Toggle checked={form.humanize} onChange={(v) => set("humanize", v)} label="Human mode" />
              <div>
                <div className="text-[13px] text-fg">Human mode</div>
                <div className="text-[12px] text-fg-3">Shuffled claim order, random pauses and changing online status.</div>
              </div>
            </div>
            <Field label="Skip rate (%)" hint="Chance each account sits out a nuke. 20 means about 1 in 5.">
              <Input inputMode="numeric" className="w-28 tabular" value={String(form.skipRate)} onChange={(e) => set("skipRate", int(e.target.value, 0, 100))} />
            </Field>
          </>
        )}
      </Section>

      <Section title="Dashboard">
        <p className="text-[13px] text-fg-2">Self-bots are against Discord's rules. Any account here can get banned.</p>
        <Button
          variant="secondary"
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
        >
          Sign out
        </Button>
      </Section>

      <div className={cn("h-16", !dirty && "hidden")} />
      {dirty && (
        <div className="fixed inset-x-0 bottom-[60px] md:bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur pb-safe">
          <div className="max-w-[1080px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-fg-2 mr-auto">
              {save.error ? <span className="text-bad">{(save.error as Error).message}</span> : "Unsaved changes"}
            </span>
            <Button variant="ghost" onClick={reset}>Discard</Button>
            <Button variant="primary" busy={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
