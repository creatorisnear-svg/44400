import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, Dot, Field, Input, Notice, Segmented, Textarea } from "./ui";

interface Preview {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
}

const verifyToken = (token: string): Promise<Preview> =>
  apiFetch("/api/accounts/validate-token", { method: "POST", body: JSON.stringify({ token }) });

const addAccount = (body: { label: string; token: string; username?: string; ign?: string }) =>
  apiFetch("/api/accounts", { method: "POST", body: JSON.stringify(body) });

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Who({ p }: { p: Preview }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2.5">
      <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full bg-raised" />
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{p.globalName ?? p.username}</div>
        <div className="text-[12px] text-fg-3 truncate">@{p.username} · token works</div>
      </div>
    </div>
  );
}

/** Paste one token, see who it is, add it. */
export function AddOneAccount({ onAdded, submitLabel }: { onAdded?: () => void; submitLabel?: string }) {
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [label, setLabel] = useState("");
  const [ign, setIgn] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef("");

  async function check(t: string) {
    const value = t.trim();
    if (!value) return;
    latest.current = value;
    setChecking(true);
    setErr(null);
    try {
      const p = await verifyToken(value);
      if (latest.current !== value) return;
      setPreview(p);
      setLabel((prev) => prev || p.globalName || p.username);
    } catch (e) {
      if (latest.current !== value) return;
      setPreview(null);
      setErr((e as Error).message);
    } finally {
      if (latest.current === value) setChecking(false);
    }
  }

  function onToken(v: string) {
    setToken(v);
    setPreview(null);
    setErr(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length > 30) timer.current = setTimeout(() => check(v), 600);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setAdding(true);
    setErr(null);
    try {
      await addAccount({
        label: label.trim() || preview.globalName || preview.username,
        token: token.trim(),
        username: preview.username,
        ...(ign.trim() ? { ign: ign.trim() } : {}),
      });
      setToken("");
      setLabel("");
      setIgn("");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onAdded?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Discord token" hint={checking ? "Checking with Discord…" : "Paste it and Halo checks it right away."}>
        <div className="relative">
          <Input
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px] pr-10"
            placeholder="Paste the account's token"
            value={token}
            onChange={(e) => onToken(e.target.value)}
            onBlur={() => !preview && !checking && token.trim() && check(token)}
          />
          <button
            type="button"
            className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-fg-3 hover:text-fg-2"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide token" : "Show token"}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>

      {preview && <Who p={preview} />}
      {err && <Notice tone="bad">{err}</Notice>}

      {preview && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name in Halo">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="In-game name" hint="Optional. Used to link the account in auto-joined servers.">
            <Input value={ign} onChange={(e) => setIgn(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      )}

      <Button type="submit" variant="primary" busy={adding} disabled={!preview || checking}>
        {preview ? submitLabel ?? `Add @${preview.username}` : "Add account"}
      </Button>
    </form>
  );
}

interface Row {
  label: string;
  token: string;
  state: "waiting" | "checking" | "ok" | "bad" | "adding" | "added" | "failed";
  preview?: Preview;
  error?: string;
}

function parseLines(text: string): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Tokens never contain ":", so "name:token" splits cleanly.
    const i = line.indexOf(":");
    const label = i > 0 ? line.slice(0, i).trim() : "";
    const token = (i > 0 ? line.slice(i + 1) : line).trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    rows.push({ label, token, state: "waiting" });
  }
  return rows;
}

/** Paste a list of tokens, check them all, add the good ones. */
export function AddManyAccounts({ onAdded }: { onAdded?: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function checkAll() {
    const parsed = parseLines(text);
    setRows(parsed);
    setBusy(true);
    for (let i = 0; i < parsed.length; i++) {
      patch(i, { state: "checking" });
      try {
        const p = await verifyToken(parsed[i].token);
        patch(i, { state: "ok", preview: p });
      } catch (e) {
        patch(i, { state: "bad", error: (e as Error).message });
      }
      await pause(350);
    }
    setBusy(false);
  }

  async function addGood() {
    setBusy(true);
    const snapshot = rows;
    for (let i = 0; i < snapshot.length; i++) {
      const r = snapshot[i];
      if (r.state !== "ok" || !r.preview) continue;
      patch(i, { state: "adding" });
      try {
        await addAccount({
          label: r.label || r.preview.globalName || r.preview.username,
          token: r.token,
          username: r.preview.username,
        });
        patch(i, { state: "added" });
      } catch (e) {
        patch(i, { state: "failed", error: (e as Error).message });
      }
    }
    qc.invalidateQueries({ queryKey: ["accounts"] });
    setBusy(false);
    onAdded?.();
  }

  const good = rows.filter((r) => r.state === "ok").length;
  const added = rows.filter((r) => r.state === "added").length;
  const checked = rows.length > 0 && rows.every((r) => r.state !== "waiting" && r.state !== "checking");

  return (
    <div className="space-y-4">
      <Field label="Tokens" hint="One per line. To name one, write name:token.">
        <Textarea
          rows={6}
          spellCheck={false}
          className="font-mono text-[12px] leading-relaxed"
          placeholder={"token1\nMain alt:token2"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRows([]);
          }}
        />
      </Field>

      {rows.length > 0 && (
        <ul className="rounded-md border border-line divide-y divide-line max-h-60 overflow-y-auto">
          {rows.map((r, i) => (
            <li key={r.token} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <Dot
                tone={
                  r.state === "ok" || r.state === "added" ? "ok"
                  : r.state === "bad" || r.state === "failed" ? "bad"
                  : r.state === "waiting" ? "off" : "connecting"
                }
              />
              <span className="flex-1 min-w-0 truncate">
                {r.preview ? (
                  <>
                    {r.label || r.preview.globalName || r.preview.username}{" "}
                    <span className="text-fg-3">@{r.preview.username}</span>
                  </>
                ) : (
                  <span className="font-mono text-fg-3">…{r.token.slice(-8)}</span>
                )}
              </span>
              <span className={cn("shrink-0 text-[12px]", r.error ? "text-bad" : "text-fg-3")}>
                {r.error ??
                  { waiting: "Waiting", checking: "Checking", ok: "Ready", bad: "", adding: "Adding", added: "Added", failed: "" }[r.state]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!checked || good === 0 ? (
          <Button variant="primary" busy={busy} disabled={!text.trim()} onClick={checkAll}>
            Check tokens
          </Button>
        ) : (
          <Button variant="primary" busy={busy} onClick={addGood}>
            Add {good} account{good === 1 ? "" : "s"}
          </Button>
        )}
        {added > 0 && <span className="text-[13px] text-fg-2">{added} added.</span>}
      </div>
    </div>
  );
}

export function AddAccountsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<"one" | "many">("one");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-lg border-line-strong bg-panel p-5 sm:p-6 gap-5">
        <div className="space-y-1.5 pr-6">
          <DialogTitle className="text-[17px] font-semibold">Add accounts</DialogTitle>
          <DialogDescription className="text-[13px] text-fg-2">
            Each account joins in on every nuke. Tokens stay on your server.
          </DialogDescription>
        </div>
        <Segmented
          className="justify-self-start"
          value={mode}
          onChange={setMode}
          options={[
            { value: "one", label: "One" },
            { value: "many", label: "Several at once" },
          ]}
        />
        {mode === "one" ? <AddOneAccount onAdded={() => onOpenChange(false)} /> : <AddManyAccounts />}
      </DialogContent>
    </Dialog>
  );
}
