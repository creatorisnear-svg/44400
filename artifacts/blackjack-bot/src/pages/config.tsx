import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, AlertTriangle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface BotSettings {
  id: number;
  serverId: string;
  channelId: string;
  cloverId: string;
  cloverPrefix: string;
  nukeKeywords: string;
  giveCommand: string;
  claimDelayMin: number;
  claimDelayMax: number;
  transferServer: number;
  transferChannelId: string;
  autoTransferEnabled: boolean;
  autoTransferRecipient: string;
  autoTransferIntervalMin: number;
  enabled: boolean;
}

interface Account {
  id: number;
  label: string;
  token: string;
  username: string | null;
  balance: number;
  totalClaimed: number;
  totalTransferred: number;
  enabled: boolean;
  connected: boolean;
  connectionStatus: string;
}

function AccountRow({ account, onToggle }: {
  account: Account;
  onToggle: (id: number, enabled: boolean) => void;
}) {
  const statusColor: Record<string, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    error: "bg-red-500",
    disconnected: "bg-gray-600",
  };

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor[account.connectionStatus] ?? "bg-gray-600"}`} />
        <span className="text-sm font-medium text-white flex-1">
          {account.label}
          {account.username && (
            <span className="text-gray-500 font-normal ml-2">@{account.username}</span>
          )}
        </span>
        <Switch
          checked={account.enabled}
          onCheckedChange={(v) => onToggle(account.id, v)}
        />
      </div>
      <div className="flex gap-4 pl-5 text-xs text-gray-500">
        <span>Balance: <span className="text-yellow-400">{account.balance.toLocaleString()}</span></span>
        <span>Claimed: <span className="text-green-400">{account.totalClaimed.toLocaleString()}</span></span>
        <span>Sent: <span className="text-blue-400">{account.totalTransferred.toLocaleString()}</span></span>
      </div>
    </div>
  );
}


export default function ConfigPanel() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery<BotSettings>({
    queryKey: ["bot-settings"],
    queryFn: () => apiFetch("/api/bot/settings"),
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch("/api/accounts"),
    refetchInterval: 5000,
  });

  const [form, setForm] = useState<Partial<BotSettings>>({});

  useEffect(() => {
    if (settings && Object.keys(form).length === 0) {
      setForm(settings);
    }
  }, [settings]);

  const saveSettingsMut = useMutation({
    mutationFn: (data: Partial<BotSettings>) =>
      apiFetch("/api/bot/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const toggleAccountMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/api/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettingsMut.mutate(form);
  };

  const accounts: Account[] = accountsData?.accounts ?? [];

  if (settingsLoading) {
    return <div className="text-center text-gray-500 py-8"><RefreshCw className="w-4 h-4 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit}>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Bot Settings</CardTitle>
              <CardDescription className="text-gray-500 text-xs">
                Configure which Discord server and channel to monitor for nukes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">
                  Server ID <span className="text-red-400">*</span>
                </Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="e.g. 123456789012345678"
                  value={form.serverId ?? ""}
                  onChange={(e) => set("serverId", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">Right-click server → Copy Server ID</p>
              </div>

              <div>
                <Label className="text-gray-300 text-xs mb-1 block">
                  Channel ID <span className="text-red-400">*</span>
                </Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="e.g. 987654321098765432"
                  value={form.channelId ?? ""}
                  onChange={(e) => set("channelId", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">Right-click the nuke channel → Copy Channel ID</p>
              </div>

              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Clover Bot User ID</Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="KA0SBOT's user ID"
                  value={form.cloverId ?? ""}
                  onChange={(e) => set("cloverId", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">Right-click KA0SBOT → Copy ID. Filters messages to bot only.</p>
              </div>

              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Clover Bot Prefix</Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white w-24"
                  placeholder="%"
                  value={form.cloverPrefix ?? "%"}
                  onChange={(e) => set("cloverPrefix", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">Prefix for Clover commands (default: %)</p>
              </div>

              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Nuke Keywords</Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="nuclear fallout,nuke,bomb"
                  value={form.nukeKeywords ?? ""}
                  onChange={(e) => set("nukeKeywords", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">Comma-separated keywords to detect nuke events</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Transfer Settings</CardTitle>
              <CardDescription className="text-gray-500 text-xs">
                Configure how scrap is transferred between accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Transfer Channel ID</Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Leave blank to use Nuke Channel"
                  value={form.transferChannelId ?? ""}
                  onChange={(e) => set("transferChannelId", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Channel where <span className="font-mono">/transfer</span> commands are sent. Right-click channel → Copy ID.
                </p>
              </div>

              <div>
                <Label className="text-gray-300 text-xs mb-1 block">Transfer Command</Label>
                <Input
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="/transfer"
                  value={form.giveCommand ?? "/transfer"}
                  onChange={(e) => set("giveCommand", e.target.value)}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Sends: <span className="text-gray-400 font-mono">{form.giveCommand ?? "/transfer"} recipient:@USER amount: AMOUNT server: N</span>
                </p>
              </div>

              <div>
                <Label className="text-gray-300 text-xs mb-1 block">
                  Transfer Server
                </Label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`px-4 py-2 rounded text-sm font-medium border transition-colors ${
                        (form.transferServer ?? 1) === n
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
                      }`}
                      onClick={() => set("transferServer", n)}
                    >
                      Server {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-1">Which server to receive clover points on when claiming nukes</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">Claim Delay Min (ms)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="bg-gray-800 border-gray-600 text-white"
                    value={form.claimDelayMin ?? 300}
                    onChange={(e) => set("claimDelayMin", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">Claim Delay Max (ms)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="bg-gray-800 border-gray-600 text-white"
                    value={form.claimDelayMax ?? 1200}
                    onChange={(e) => set("claimDelayMax", Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600">Random delay before each account claims a nuke (human-like behavior)</p>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-300 font-medium">Auto-Transfer</p>
                    <p className="text-xs text-gray-500">Drain all account balances on a timer</p>
                  </div>
                  <Switch
                    checked={form.autoTransferEnabled ?? false}
                    onCheckedChange={(v) => set("autoTransferEnabled", v)}
                  />
                </div>

                {form.autoTransferEnabled && (
                  <div className="space-y-3 pl-1">
                    <div>
                      <Label className="text-gray-300 text-xs mb-1 block">Recipient Username</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-sm shrink-0">@</span>
                        <Input
                          className="bg-gray-800 border-gray-600 text-white"
                          placeholder="creator5677"
                          value={form.autoTransferRecipient ?? ""}
                          onChange={(e) => set("autoTransferRecipient", e.target.value.replace(/^@/, ""))}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">Points sent to this user automatically</p>
                    </div>
                    <div>
                      <Label className="text-gray-300 text-xs mb-1 block">Interval (minutes)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        className="bg-gray-800 border-gray-600 text-white w-28"
                        value={form.autoTransferIntervalMin ?? 10}
                        onChange={(e) => set("autoTransferIntervalMin", Number(e.target.value))}
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Each account waits a random 30–120s before sending to avoid spam detection
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-700 pt-4">
                <p className="text-xs text-yellow-300/80 bg-yellow-900/20 border border-yellow-700/40 rounded p-3 flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-500" />
                  Self-bots violate Discord's Terms of Service. Use at your own risk.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500"
            disabled={saveSettingsMut.isPending}
          >
            <Save className="w-4 h-4 mr-1" />
            {saveSettingsMut.isPending ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
          </Button>
          {saveSettingsMut.error && (
            <span className="text-sm text-red-400">{(saveSettingsMut.error as Error).message}</span>
          )}
        </div>
      </form>

      <Card className="bg-gray-900 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Accounts</CardTitle>
          <CardDescription className="text-gray-500 text-xs">
            Loaded from <span className="font-mono">DISCORD_ACCOUNTS</span> env var. Toggle to enable/disable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {accountsLoading ? (
            <div className="text-gray-500 text-sm py-2 flex gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : (
            accounts.map((acc) => (
              <AccountRow
                key={acc.id}
                account={acc}
                onToggle={(id, enabled) => toggleAccountMut.mutate({ id, enabled })}
              />
            ))
          )}
          <p className="text-xs text-gray-600 pt-1">
            Accounts are loaded from the <span className="font-mono text-gray-500">DISCORD_ACCOUNTS</span> environment variable.
          </p>
        </CardContent>
      </Card>

      <TokenValidator />
    </div>
  );
}

function TokenValidator() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<{ username: string; globalName: string | null; avatarUrl: string; id: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => apiFetch("/api/accounts/validate-token", { method: "POST", body: JSON.stringify({ token }) }),
    onSuccess: (data) => { setResult(data); setErr(null); },
    onError: (e) => { setErr((e as Error).message); setResult(null); },
  });

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Token Validator
        </CardTitle>
        <CardDescription className="text-gray-500 text-xs">
          Paste a Discord token to verify it works before adding it to your env var.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            className="bg-gray-800 border-gray-600 text-white font-mono text-xs flex-1"
            placeholder="mfa.xxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={token}
            onChange={(e) => { setToken(e.target.value); setResult(null); setErr(null); }}
            type="password"
          />
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={!token.trim() || mut.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
          >
            {mut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Check"}
          </Button>
        </div>

        {result && (
          <div className="flex items-center gap-3 p-3 bg-green-950 border border-green-800 rounded-lg">
            <img src={result.avatarUrl} alt="avatar" className="w-10 h-10 rounded-full shrink-0" />
            <div className="min-w-0">
              <p className="text-green-300 font-semibold text-sm">✓ Valid token</p>
              <p className="text-white text-sm font-medium truncate">{result.globalName ?? result.username}</p>
              <p className="text-gray-400 text-xs font-mono">@{result.username} · {result.id}</p>
            </div>
          </div>
        )}

        {err && (
          <div className="flex items-center gap-2 p-3 bg-red-950 border border-red-800 rounded-lg">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <div>
              <p className="text-red-300 text-sm font-semibold">Invalid token</p>
              <p className="text-red-400 text-xs">{err}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="p-3 bg-gray-800 rounded-lg">
            <p className="text-gray-400 text-xs mb-1">Add this to your <span className="font-mono text-gray-300">DISCORD_ACCOUNTS</span> env var:</p>
            <p className="font-mono text-xs text-yellow-300 break-all select-all">
              {result.globalName ?? result.username}:{token}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
