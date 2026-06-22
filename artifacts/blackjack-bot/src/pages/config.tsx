import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Save, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

interface Config {
  id: number;
  discordToken: string;
  serverId: string;
  channelId: string;
  kaosPrefix: string;
  kaosUserId: string;
  betAmount: number;
  strategy: string;
  delayMin: number;
  delayMax: number;
  maxGames: number | null;
  stopOnLoss: number | null;
  stopOnWin: number | null;
}

export default function ConfigPanel() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery<Config>({
    queryKey: ["bot-config"],
    queryFn: () => apiFetch("/api/bot/config"),
  });

  const [form, setForm] = useState<Partial<Config>>({});
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config && Object.keys(form).length === 0) {
      setForm(config);
    }
  }, [config]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<Config>) =>
      apiFetch("/api/bot/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const set = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMut.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="text-center text-gray-500 py-8">Loading config...</div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Discord Settings</CardTitle>
            <CardDescription className="text-gray-500 text-xs">
              Your user account credentials and target server/channel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">
                Discord User Token{" "}
                <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  className="bg-gray-800 border-gray-600 text-white pr-10"
                  placeholder="Your Discord user token"
                  value={form.discordToken ?? ""}
                  onChange={(e) => set("discordToken", e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Found in DevTools → Network → Authorization header
              </p>
            </div>

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
              <p className="text-xs text-gray-600 mt-1">
                Right-click the server → Copy ID (enable Developer Mode first)
              </p>
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
              <p className="text-xs text-gray-600 mt-1">
                Right-click the blackjack channel → Copy ID
              </p>
            </div>

            <div>
              <Label className="text-gray-300 text-xs mb-1 block">
                Kaos Bot User ID
              </Label>
              <Input
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Kaos Bot's Discord user ID"
                value={form.kaosUserId ?? ""}
                onChange={(e) => set("kaosUserId", e.target.value)}
              />
              <p className="text-xs text-gray-600 mt-1">
                Right-click Kaos Bot → Copy ID. Leave blank to accept all bot messages.
              </p>
            </div>

            <div>
              <Label className="text-gray-300 text-xs mb-1 block">
                Command Prefix
              </Label>
              <Input
                className="bg-gray-800 border-gray-600 text-white w-24"
                placeholder="$"
                value={form.kaosPrefix ?? "$"}
                onChange={(e) => set("kaosPrefix", e.target.value)}
              />
              <p className="text-xs text-gray-600 mt-1">
                Prefix for Kaos Bot commands (e.g. $ → $blackjack, $hit, $stand)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Game Settings</CardTitle>
            <CardDescription className="text-gray-500 text-xs">
              Betting, strategy, and safety limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">Bet Amount (scrap)</Label>
              <Input
                type="number"
                min={1}
                className="bg-gray-800 border-gray-600 text-white"
                value={form.betAmount ?? 100}
                onChange={(e) => set("betAmount", Number(e.target.value))}
              />
            </div>

            <div>
              <Label className="text-gray-300 text-xs mb-1 block">Strategy</Label>
              <Select
                value={form.strategy ?? "basic"}
                onValueChange={(v) => set("strategy", v)}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="basic">Basic Strategy</SelectItem>
                  <SelectItem value="aggressive">Aggressive (more doubles/splits)</SelectItem>
                  <SelectItem value="conservative">Conservative (fewer risks)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">
                  Delay Min (ms)
                </Label>
                <Input
                  type="number"
                  min={500}
                  className="bg-gray-800 border-gray-600 text-white"
                  value={form.delayMin ?? 2000}
                  onChange={(e) => set("delayMin", Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">
                  Delay Max (ms)
                </Label>
                <Input
                  type="number"
                  min={1000}
                  className="bg-gray-800 border-gray-600 text-white"
                  value={form.delayMax ?? 5000}
                  onChange={(e) => set("delayMax", Number(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Random delay between hands to appear more human-like.
            </p>

            <div className="border-t border-gray-700 pt-3">
              <p className="text-xs text-gray-400 font-medium mb-3">
                Safety Limits (optional)
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">
                    Max Games per Session
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Unlimited"
                    value={form.maxGames ?? ""}
                    onChange={(e) =>
                      set("maxGames", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">
                    Stop-Loss (scrap)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="No limit"
                    value={form.stopOnLoss ?? ""}
                    onChange={(e) =>
                      set("stopOnLoss", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                  <p className="text-xs text-gray-600 mt-1">Stop if losses exceed this amount</p>
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">
                    Stop-Win (scrap)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="No limit"
                    value={form.stopOnWin ?? ""}
                    onChange={(e) =>
                      set("stopOnWin", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                  <p className="text-xs text-gray-600 mt-1">Stop once this profit is reached</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500"
          disabled={saveMut.isPending}
        >
          <Save className="w-4 h-4 mr-1" />
          {saveMut.isPending ? "Saving..." : saved ? "Saved!" : "Save Config"}
        </Button>
        {saveMut.error && (
          <span className="text-sm text-red-400">
            {(saveMut.error as Error).message}
          </span>
        )}
      </div>

      <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg flex gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300/80">
          Self-bots (user account automation) violate Discord's Terms of Service. Use at
          your own risk. This tool is provided for educational purposes only.
        </p>
      </div>
    </form>
  );
}
