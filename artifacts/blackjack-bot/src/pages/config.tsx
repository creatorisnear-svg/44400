import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Save, Plus, Trash2, AlertTriangle, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

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

function AccountRow({ account, onUpdate, onDelete }: {
  account: Account;
  onUpdate: (id: number, data: Partial<Account>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(account.label);
  const [token, setToken] = useState(account.token);
  const [showToken, setShowToken] = useState(false);

  const save = () => {
    onUpdate(account.id, { label, token });
    setEditing(false);
  };

  const statusColor: Record<string, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    error: "bg-red-500",
    disconnected: "bg-gray-600",
  };

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
      <div className="flex items-center gap-3">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${statusColor[account.connectionStatus] ?? "bg-gray-600"}`}
        />
        {editing ? (
          <Input
            className="bg-gray-700 border-gray-600 text-white text-sm h-7 flex-1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        ) : (
          <span className="text-sm font-medium text-white flex-1">
            {account.label}
            {account.username && (
              <span className="text-gray-500 font-normal ml-2">@{account.username}</span>
            )}
          </span>
        )}
        <Switch
          checked={account.enabled}
          onCheckedChange={(v) => onUpdate(account.id, { enabled: v })}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-gray-400 hover:text-white"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-red-500 hover:text-red-400"
          onClick={() => onDelete(account.id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {editing && (
        <div className="space-y-2 pl-5">
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              className="bg-gray-700 border-gray-600 text-white text-xs pr-8"
              placeholder="Discord user token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 h-7 text-xs"
            onClick={save}
          >
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
        </div>
      )}

      <div className="flex gap-4 pl-5 text-xs text-gray-500">
        <span>Balance: <span className="text-yellow-400">{account.balance.toLocaleString()}</span></span>
        <span>Claimed: <span className="text-green-400">{account.totalClaimed.toLocaleString()}</span></span>
        <span>Sent: <span className="text-blue-400">{account.totalTransferred.toLocaleString()}</span></span>
      </div>
    </div>
  );
}

function AddAccountForm({ onAdd }: { onAdd: (label: string, token: string) => void }) {
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !token) return;
    onAdd(label, token);
    setLabel("");
    setToken("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="border-dashed border-gray-600 text-gray-400 hover:text-white w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-3 h-3 mr-1" />
        Add Account
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-800 rounded-lg space-y-2 border border-dashed border-gray-600">
      <p className="text-xs text-gray-400 font-medium">New Account</p>
      <Input
        className="bg-gray-700 border-gray-600 text-white text-sm"
        placeholder="Label (e.g. Main, Alt 1)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="relative">
        <Input
          type={showToken ? "text" : "password"}
          className="bg-gray-700 border-gray-600 text-white text-sm pr-8"
          placeholder="Discord user token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
          onClick={() => setShowToken((v) => !v)}
        >
          {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-500 h-7 text-xs">
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-gray-400"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
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

  const updateAccountMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Account> }) =>
      apiFetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const deleteAccountMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const addAccountMut = useMutation({
    mutationFn: ({ label, token }: { label: string; token: string }) =>
      apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, token }),
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
            Add Discord accounts (user tokens) to claim nukes from. Each account claims independently.
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
                onUpdate={(id, data) => updateAccountMut.mutate({ id, data })}
                onDelete={(id) => deleteAccountMut.mutate(id)}
              />
            ))
          )}
          <AddAccountForm
            onAdd={(label, token) => addAccountMut.mutate({ label, token })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
