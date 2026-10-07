import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { afterTax, num } from "@/lib/format";
import { useAccounts, useSettings, type Account } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AddAccountsDialog } from "@/components/halo/add-account";
import { Button, ConnectionLabel, Field, Input, Notice, PageHeader, Panel, Spinner, Toggle } from "@/components/halo/ui";

const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_120px_110px_110px_110px_28px] md:items-center md:gap-4";

function useAccountPatch(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ label: string; ign: string; enabled: boolean }>) =>
      apiFetch(`/api/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

/** Text field that saves when you leave it. */
function SaveOnBlur({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function SendForm({ account, defaultTo, onDone }: { account: Account; defaultTo: string; onDone: (msg: { ok: boolean; text: string }) => void }) {
  const qc = useQueryClient();
  const [to, setTo] = useState(defaultTo);
  const [amount, setAmount] = useState(String(account.balance || ""));
  const value = Number(amount) || 0;

  const send = useMutation({
    mutationFn: () =>
      apiFetch("/api/transfer", {
        method: "POST",
        body: JSON.stringify({ toUsername: to.trim().replace(/^@/, ""), amount: value, accountIds: [account.id] }),
      }),
    onSuccess: (data) => {
      const r = data.results?.[0];
      onDone(r?.success ? { ok: true, text: `Sent ${num(r.amount)} to ${to.trim()}.` } : { ok: false, text: r?.error ?? "Transfer failed." });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => onDone({ ok: false, text: (e as Error).message }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (to.trim() && value > 0) send.mutate();
      }}
      className="rounded-md border border-line p-4 space-y-4 bg-canvas"
    >
      <div className="grid sm:grid-cols-[minmax(0,1fr)_160px] gap-4">
        <Field label="Send to" hint="Discord username or user ID.">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="username" autoFocus />
        </Field>
        <Field label="Amount" hint={value > 0 ? `They get ${num(afterTax(value))} after the 20% tax.` : undefined}>
          <Input inputMode="numeric" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={send.isPending} disabled={!to.trim() || value <= 0}>
          Send {value > 0 ? num(value) : ""}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone({ ok: true, text: "" })}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AccountRow({ account, open, onToggle, defaultTo }: { account: Account; open: boolean; onToggle: () => void; defaultTo: string }) {
  const qc = useQueryClient();
  const patch = useAccountPatch(account.id);
  const [sending, setSending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const connected = account.connectionStatus === "connected";

  const balance = useMutation({
    mutationFn: () => apiFetch(`/api/accounts/${account.id}/refresh-balance`, { method: "POST" }),
    onSuccess: (d) =>
      setMsg(d.balance !== null ? { ok: true, text: `Balance is ${num(d.balance)}.` } : { ok: false, text: "The game bot didn't answer. Try again in a bit." }),
    onError: (e) => setMsg({ ok: false, text: (e as Error).message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const relink = useMutation({
    mutationFn: () => apiFetch(`/api/accounts/${account.id}/relink`, { method: "POST" }),
    onSuccess: () => setMsg({ ok: true, text: "Relinking. Watch Activity on the Overview page." }),
    onError: (e) => setMsg({ ok: false, text: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/accounts/${account.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  return (
    <li className={cn(open && "bg-[#101010]")}>
      <button
        type="button"
        onClick={onToggle}
        className={cn("w-full text-left px-4 py-3 hover:bg-raised/60 transition-colors flex items-center gap-3", COLS)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{account.label}</div>
          <div className="text-[12px] text-fg-3 truncate">
            {account.username ? `@${account.username}` : "Not connected yet"}
            {account.ign ? ` · plays as ${account.ign}` : ""}
          </div>
          <div className="md:hidden mt-1 flex flex-wrap gap-x-4 text-[12px] text-fg-3 tabular">
            <ConnectionLabel status={account.connectionStatus} enabled={account.enabled} />
            <span>Claimed {num(account.totalClaimed)}</span>
            <span>Sent {num(account.totalTransferred)}</span>
          </div>
        </div>
        <div className="hidden md:block"><ConnectionLabel status={account.connectionStatus} enabled={account.enabled} /></div>
        <div className={cn("text-right text-sm tabular font-medium shrink-0", account.balance > 0 ? "text-halo" : "text-fg-3")}>{num(account.balance)}</div>
        <div className="hidden md:block text-right text-sm tabular text-fg-2">{num(account.totalClaimed)}</div>
        <div className="hidden md:block text-right text-sm tabular text-fg-2">{num(account.totalTransferred)}</div>
        <ChevronDown className={cn("w-4 h-4 text-fg-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-5 pt-1 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={balance.isPending} disabled={!connected} onClick={() => balance.mutate()} title={connected ? undefined : "Account must be online"}>
              Check balance
            </Button>
            <Button size="sm" disabled={!connected} onClick={() => { setSending((v) => !v); setMsg(null); }} title={connected ? undefined : "Account must be online"}>
              Send points
            </Button>
            <Button size="sm" busy={relink.isPending} disabled={!connected} onClick={() => relink.mutate()} title="Join the auto-join servers and link the in-game name again">
              Relink
            </Button>
            {!confirmRemove ? (
              <Button size="sm" variant="ghost" className="sm:ml-auto" onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            ) : (
              <span className="sm:ml-auto inline-flex items-center gap-2">
                <span className="text-[13px] text-fg-2">Remove {account.label}?</span>
                <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>Remove</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep</Button>
              </span>
            )}
          </div>

          {msg && msg.text && <Notice tone={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}

          {sending && (
            <SendForm
              account={account}
              defaultTo={defaultTo}
              onDone={(m) => {
                setSending(false);
                setMsg(m.text ? m : null);
              }}
            />
          )}

          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <Field label="Name in Halo">
              <SaveOnBlur value={account.label} onSave={(label) => label && patch.mutate({ label })} />
            </Field>
            <Field label="In-game name" hint="Used to link this account in auto-joined servers.">
              <SaveOnBlur value={account.ign ?? ""} placeholder="Not set" onSave={(ign) => patch.mutate({ ign })} />
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <Toggle checked={account.enabled} onChange={(enabled) => patch.mutate({ enabled })} label="Claims nukes" />
            <span className="text-[13px] text-fg-2">
              {account.enabled ? "Claims nukes" : "Turned off. It stays offline and skips nukes."}
            </span>
          </div>
          {patch.error && <Notice tone="bad">{(patch.error as Error).message}</Notice>}
        </div>
      )}
    </li>
  );
}

export default function Accounts() {
  const [fast, setFast] = useState(false);
  const { data, isLoading } = useAccounts(fast);
  const { data: settings } = useSettings();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const accounts = data?.accounts ?? [];
  const balance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const online = accounts.filter((a) => a.connectionStatus === "connected").length;

  const refreshAll = useMutation({
    mutationFn: () => apiFetch("/api/accounts/refresh-balances", { method: "POST" }),
    onSuccess: (d) => {
      setNote({ ok: true, text: d.message });
      setFast(true);
      setTimeout(() => setFast(false), 120_000);
    },
    onError: (e) => setNote({ ok: false, text: (e as Error).message }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        sub={
          accounts.length
            ? <span className="tabular">{accounts.length} accounts · {online} online · {num(balance)} points</span>
            : "The Discord accounts that claim nukes."
        }
        actions={
          <>
            {accounts.length > 0 && (
              <Button busy={refreshAll.isPending} onClick={() => refreshAll.mutate()} title="Asks the game bot for each balance, one account every 10 minutes">
                Refresh balances
              </Button>
            )}
            <Button variant="primary" onClick={() => setAdding(true)}>Add accounts</Button>
          </>
        }
      />

      {note && <Notice tone={note.ok ? "info" : "bad"}>{note.text}</Notice>}

      {isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <Panel className="px-5 py-6 space-y-3">
          <p className="text-sm">No accounts yet.</p>
          <p className="text-[13px] text-fg-2 max-w-md">
            Add the Discord accounts that should claim nukes. You can paste a whole list of tokens at once.
          </p>
          <Button variant="primary" onClick={() => setAdding(true)}>Add accounts</Button>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className={cn("hidden px-4 py-2 border-b border-line text-[12px] text-fg-3", COLS)}>
            <span>Account</span>
            <span>Status</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Claimed</span>
            <span className="text-right">Sent</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                open={openId === a.id}
                onToggle={() => setOpenId((id) => (id === a.id ? null : a.id))}
                defaultTo={settings?.autoTransferRecipient ?? ""}
              />
            ))}
          </ul>
        </Panel>
      )}

      <AddAccountsDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
