import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { afterTax, handle, num, TAX_RATE } from "@/lib/format";
import { useAccounts, useSettings, useStatus } from "@/lib/hooks";
import { TransferProgress } from "@/components/halo/transfer-progress";
import { Button, Field, Input, Notice, PageHeader, Panel } from "@/components/halo/ui";

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
      <span className={strong ? "text-fg font-medium" : "text-fg-2"}>{label}</span>
      <span className={strong ? "text-ok font-semibold tabular text-[15px]" : "text-fg tabular"}>{value}</span>
    </div>
  );
}

export default function Transfer() {
  const qc = useQueryClient();
  const { data: status } = useStatus();
  const { data: settings } = useSettings();
  const { data: accountsData } = useAccounts();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    // Prefill the usual recipient once settings arrive.
    if (settings?.autoTransferRecipient) setTo((t) => t || settings.autoTransferRecipient);
  }, [settings?.autoTransferRecipient]);

  const order = status?.fillOrder ?? null;
  const active = !!order && !order.done;
  const accounts = accountsData?.accounts ?? [];
  const online = accounts.filter((a) => a.connectionStatus === "connected");
  const available = online.reduce((s, a) => s + (a.balance ?? 0), 0);
  const gross = Number(amount) || 0;
  const gap = settings?.autoTransferIntervalMin ?? 10;

  const start = useMutation({
    mutationFn: () =>
      apiFetch("/api/transfer/fill", {
        method: "POST",
        body: JSON.stringify({ toUsername: to.trim().replace(/^@/, ""), totalAmount: gross }),
      }),
    onSuccess: () => {
      setAmount("");
      qc.invalidateQueries({ queryKey: ["bot-status"] });
    },
  });

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        title="Transfer"
        sub="Send points from your accounts to one person. Accounts send one after another until the amount is covered."
      />

      {order && <TransferProgress order={order} />}

      {!active && (
        <Panel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (to.trim() && gross > 0) start.mutate();
            }}
            className="p-5 space-y-5"
          >
            <Field label="Send to" hint="Discord username or user ID of the person getting the points.">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="username" />
            </Field>

            <Field
              label="Total to send"
              hint={
                <>
                  {online.length} online account{online.length === 1 ? "" : "s"} hold <span className="tabular">{num(available)}</span>.{" "}
                  {available > 0 && (
                    <button type="button" className="text-fg-2 underline underline-offset-4 hover:text-fg" onClick={() => setAmount(String(available))}>
                      Send all of it
                    </button>
                  )}
                </>
              }
            >
              <Input
                inputMode="numeric"
                className="tabular text-base"
                placeholder="100,000"
                value={amount ? Number(amount).toLocaleString() : ""}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              />
            </Field>

            {gross > 0 && (
              <div className="rounded-md border border-line px-4 py-1 divide-y divide-line">
                <Line label="Your accounts send" value={num(gross)} />
                <Line label={`Game tax (${Math.round(TAX_RATE * 100)}%)`} value={`−${num(gross - afterTax(gross))}`} />
                <Line label={to.trim() ? `${handle(to.trim().replace(/^@/, ""))} gets` : "They get"} value={num(afterTax(gross))} strong />
              </div>
            )}

            {gross > available && available > 0 && (
              <Notice tone="warn">That's more than your online accounts hold. Halo sends what it can.</Notice>
            )}
            {start.error && <Notice tone="bad">{(start.error as Error).message}</Notice>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="lg" busy={start.isPending} disabled={!to.trim() || gross <= 0}>
                Start transfer
              </Button>
              <span className="text-[12px] text-fg-3">
                {gap} min between accounts.{" "}
                <Link href="/settings" className="underline underline-offset-4 hover:text-fg-2">Change</Link>
              </span>
            </div>
          </form>
        </Panel>
      )}

      {settings && (
        <p className="text-[13px] text-fg-3">
          Auto-transfer is{" "}
          {settings.autoTransferEnabled && settings.autoTransferRecipient ? (
            <>
              <span className="text-fg-2">on</span>: every {settings.autoTransferIntervalMin} min, balances go to{" "}
              <span className="text-fg-2">{handle(settings.autoTransferRecipient)}</span>.
            </>
          ) : (
            <span className="text-fg-2">off</span>
          )}{" "}
          <Link href="/settings" className="underline underline-offset-4 hover:text-fg-2">Settings</Link>
        </p>
      )}
    </div>
  );
}
