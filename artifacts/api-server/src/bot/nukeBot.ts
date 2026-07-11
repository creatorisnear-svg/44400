import { Client, Message, MessageActionRow, MessageButton } from "discord.js-selfbot-v13";
import { db } from "@workspace/db";
import {
  accountsTable,
  botSettingsTable,
  nukeEventsTable,
  claimsTable,
  transfersTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { botLog } from "./logger.js";

export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

interface AccountRuntime {
  accountId: number;
  label: string;
  client: Client | null;
  status: ConnectionStatus;
  username: string | null;
  claimsThisSession: number;
  scrapThisSession: number;
}

interface FillStep {
  label: string;
  accountId: number;
  amount: number;
  status: "pending" | "sending" | "sent" | "skipped" | "error";
  error?: string;
  sentAt?: number;
}

interface ActiveFillOrder {
  toUsername: string;
  totalRequested: number;
  totalSent: number;
  steps: FillStep[];
  nextSendAt: number | null;
  done: boolean;
  cancelRequested: boolean;
}

interface BotStatusData {
  running: boolean;
  accounts: {
    accountId: number;
    label: string;
    username: string | null;
    connected: boolean;
    status: ConnectionStatus;
    balance: number;
    claimsThisSession: number;
    scrapThisSession: number;
  }[];
  totalClaimsToday: number;
  totalScrapToday: number;
  uptime: number;
  nextAutoTransferAt: number | null;
  fillOrder: ActiveFillOrder | null;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randDelay = (min: number, max: number) =>
  delay(Math.floor(Math.random() * (max - min) + min));

function isNukeMessage(content: string, embeds: any[], keywords: string[]): boolean {
  const full = (
    content +
    " " +
    embeds
      .map((e) => `${e.title ?? ""} ${e.description ?? ""} ${(e.fields ?? []).map((f: any) => f.name + " " + f.value).join(" ")}`)
      .join(" ")
  ).toLowerCase();

  return keywords.some((kw) => full.includes(kw.toLowerCase().trim()));
}

// Parse a balance number from any KA0SBOT balance reply text.
// Handles formats like "S1| 349,010.00 clover points", "**100,000** clover points", etc.
function parseBalanceFromText(raw: string): number | null {
  const text = raw.replace(/\*{1,2}|_{1,2}|~~|`/g, " ").replace(/\s+/g, " ");
  const patterns = [
    /([\d,]+(?:\.\d+)?)\s*clover\s*points?/i,
    /clover\s*points?[:\s]+([\d,]+(?:\.\d+)?)/i,
    /S\d+\s*\|\s*([\d,]+(?:\.\d+)?)/i,
    /balance[:\s]+([\d,]+(?:\.\d+)?)/i,
    /wallet[:\s]+([\d,]+(?:\.\d+)?)/i,
    /you\s+have\s+([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*clover/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = Math.floor(parseFloat(m[1].replace(/,/g, "")));
      if (!isNaN(val) && val >= 0) return val;
    }
  }
  return null;
}

// Recursively extract all text strings from a nested message/interaction object.
function extractAllText(obj: any): string {
  if (!obj) return "";
  const parts: string[] = [];
  const dig = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.content === "string") parts.push(o.content);
    if (typeof o.description === "string") parts.push(o.description);
    if (typeof o.title === "string") parts.push(o.title);
    if (typeof o.value === "string") parts.push(o.value);
    if (typeof o.name === "string" && typeof o.value !== "undefined") parts.push(o.name);
    for (const key of ["embeds", "fields", "components", "message", "data"]) {
      if (Array.isArray(o[key])) o[key].forEach(dig);
      else if (o[key]) dig(o[key]);
    }
  };
  dig(obj);
  return parts.join(" ");
}

function parseScrapFromText(raw: string): number {
  // Strip Discord markdown (**, *, __, _, ~~, `) before pattern matching so
  // "Successfully claimed **100,000** clover points" parses correctly.
  const text = raw.replace(/\*{1,2}|_{1,2}|~~|`/g, " ").replace(/\s+/g, " ");
  const patterns = [
    // KA0SBOT ephemeral: "Successfully claimed 100,000 clover points on Server 1"
    /successfully\s+claimed\s+([\d,]+)\s*(?:clover\s+)?points?/i,
    /claimed\s+([\d,]+)\s*(?:clover\s+)?points?/i,
    // Generic fallbacks
    /you\s+(?:received?|gained?|got)\s+([\d,]+)\s*(?:scrap|clover|coins?|points?)/i,
    /\+\s*([\d,]+)\s*(?:scrap|clover|coins?|points?)/i,
    /([\d,]+)\s*(?:clover\s+)?points?\s+(?:claimed|received?)/i,
    /([\d,]+)\s*(?:scrap|coins?)\s+(?:claimed|received?)/i,
    // Broad fallback: any large standalone number followed by "clover points"
    /([\d,]{4,})\s*clover\s*points?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseInt(m[1].replace(/,/g, ""), 10);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return 0;
}

class NukeBot {
  private runtimes: Map<number, AccountRuntime> = new Map();
  private running = false;
  private startTime: number | null = null;
  private totalClaimsToday = 0;
  private totalScrapToday = 0;
  private processingNukes = new Set<string>();
  private autoTransferTimer: ReturnType<typeof setInterval> | null = null;
  private nextAutoTransferAt: number | null = null;
  private activeFillOrder: ActiveFillOrder | null = null;

  getStatus(): BotStatusData {
    const accounts = [...this.runtimes.values()].map((r) => ({
      accountId: r.accountId,
      label: r.label,
      username: r.username,
      connected: r.status === "connected",
      status: r.status,
      balance: 0,
      claimsThisSession: r.claimsThisSession,
      scrapThisSession: r.scrapThisSession,
    }));
    return {
      running: this.running,
      accounts,
      totalClaimsToday: this.totalClaimsToday,
      totalScrapToday: this.totalScrapToday,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      nextAutoTransferAt: this.nextAutoTransferAt,
      fillOrder: this.activeFillOrder,
    };
  }

  cancelFillOrder(): void {
    if (this.activeFillOrder && !this.activeFillOrder.done) {
      this.activeFillOrder.cancelRequested = true;
      botLog.info("Fill order cancelled by user.");
    }
  }

  async startFillOrder(toUsername: string, totalAmount: number): Promise<void> {
    if (this.activeFillOrder && !this.activeFillOrder.done) {
      throw new Error("A fill order is already in progress. Cancel it first.");
    }

    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured.");

    const runtimes = [...this.runtimes.values()].filter(
      (r) => r.status === "connected" && r.client,
    );
    if (runtimes.length === 0) throw new Error("No connected accounts available.");

    const dbAccounts = await db.select().from(accountsTable);
    const balanceMap = new Map(dbAccounts.map((a) => [a.id, a.balance]));

    let remaining = totalAmount;
    const steps: FillStep[] = [];

    for (const runtime of runtimes) {
      if (remaining <= 0) break;
      const balance = balanceMap.get(runtime.accountId) ?? 0;
      if (balance <= 0) continue;
      const sendAmount = Math.min(balance, remaining);
      steps.push({ label: runtime.label, accountId: runtime.accountId, amount: sendAmount, status: "pending" });
      remaining -= sendAmount;
    }

    if (steps.length === 0) {
      throw new Error("No accounts have enough balance to fulfill this order.");
    }

    if (remaining > 0) {
      botLog.warn(`Fill order: accounts can only cover ${totalAmount - remaining} of ${totalAmount} requested.`);
    }

    this.activeFillOrder = {
      toUsername,
      totalRequested: totalAmount,
      totalSent: 0,
      steps,
      nextSendAt: null,
      done: false,
      cancelRequested: false,
    };

    botLog.info(`💸 Fill order started: ${totalAmount.toLocaleString()} → @${toUsername} across ${steps.length} account(s)`);

    this.runFillOrder(settings).catch((err) => {
      botLog.error(`Fill order error: ${(err as Error).message}`);
      if (this.activeFillOrder) this.activeFillOrder.done = true;
    });
  }

  private async runFillOrder(settings: typeof botSettingsTable.$inferSelect): Promise<void> {
    const fo = this.activeFillOrder!;
    const intervalMs = ((settings as any).autoTransferIntervalMin ?? 10) * 60 * 1000;
    const transferChannelId = (settings as any).transferChannelId || settings.channelId;
    const server = (settings as any).transferServer ?? 1;

    for (let i = 0; i < fo.steps.length; i++) {
      if (fo.cancelRequested) {
        botLog.info("Fill order: cancelled.");
        fo.done = true;
        return;
      }

      if (i > 0) {
        fo.nextSendAt = Date.now() + intervalMs;
        botLog.info(`Fill order: waiting ${(settings as any).autoTransferIntervalMin ?? 10} min before next account...`);

        const intervalEnd = fo.nextSendAt;
        while (Date.now() < intervalEnd) {
          if (fo.cancelRequested) {
            fo.done = true;
            botLog.info("Fill order: cancelled during wait.");
            return;
          }
          await delay(2000);
        }
        fo.nextSendAt = null;
      }

      const step = fo.steps[i];
      const runtime = this.runtimes.get(step.accountId);

      if (!runtime || runtime.status !== "connected" || !runtime.client) {
        step.status = "error";
        step.error = "Account disconnected";
        botLog.error(`[${step.label}] Fill order: account not connected, skipping.`);
        continue;
      }

      step.status = "sending";
      botLog.info(`[${step.label}] Fill order: sending ${step.amount.toLocaleString()} → @${fo.toUsername}`);

      try {
        const channel = runtime.client.channels.cache.get(transferChannelId);
        if (!channel || !(channel as any).isText()) throw new Error(`Channel ${transferChannelId} not accessible`);

        await this.sendTransferAndConfirm(
          runtime.client, channel, settings,
          fo.toUsername, step.amount, server,
          { label: step.label, accountId: step.accountId },
        );

        step.status = "sent";
        step.sentAt = Date.now();
        fo.totalSent += step.amount;

        botLog.info(`[${step.label}] ✓ Sent ${step.amount.toLocaleString()} → @${fo.toUsername}`);

        const dbAccount = await db.select().from(accountsTable).where(eq(accountsTable.id, step.accountId)).then((r) => r[0]);
        await db.update(accountsTable).set({
          balance: Math.max(0, (dbAccount?.balance ?? 0) - step.amount),
          totalTransferred: (dbAccount?.totalTransferred ?? 0) + step.amount,
          updatedAt: new Date(),
        }).where(eq(accountsTable.id, step.accountId)).catch(() => {});

        await db.insert(transfersTable).values({
          fromAccountId: step.accountId,
          toUsername: fo.toUsername,
          amount: step.amount,
          success: true,
          error: null,
        }).catch(() => {});
      } catch (err) {
        const errMsg = (err as Error).message;
        step.status = "error";
        step.error = errMsg;
        botLog.error(`[${step.label}] Fill order failed: ${errMsg}`);
        await db.insert(transfersTable).values({
          fromAccountId: step.accountId,
          toUsername: fo.toUsername,
          amount: step.amount,
          success: false,
          error: errMsg,
        }).catch(() => {});
      }
    }

    fo.done = true;
    botLog.info(`✅ Fill order complete. Sent ${fo.totalSent.toLocaleString()} of ${fo.totalRequested.toLocaleString()} requested → @${fo.toUsername}`);
  }

  private async syncEnvAccounts(): Promise<void> {
    const raw = process.env.DISCORD_ACCOUNTS;
    if (!raw) return;

    const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed: { label: string; token: string }[] = [];
    for (const entry of entries) {
      const idx = entry.indexOf(":");
      if (idx === -1) continue;
      const label = entry.slice(0, idx).trim();
      const token = entry.slice(idx + 1).trim();
      if (label && token) parsed.push({ label, token });
    }

    if (parsed.length === 0) {
      botLog.warn("DISCORD_ACCOUNTS is set but no valid entries found. Format: Label1:TOKEN1,Label2:TOKEN2");
      return;
    }

    botLog.info(`Syncing ${parsed.length} account(s) from DISCORD_ACCOUNTS env var...`);

    // Fetch ALL accounts including soft-deleted ones so we never re-insert deleted accounts
    const existing = await db.select().from(accountsTable);
    const existingByLabel = new Map(existing.map((a) => [a.label, a]));
    const envLabels = new Set(parsed.map((p) => p.label));

    for (const { label, token } of parsed) {
      const acc = existingByLabel.get(label);
      if (acc) {
        // If this account was manually deleted (deleted=true), respect that and skip it
        if ((acc as any).deleted) {
          botLog.info(`Skipping deleted account "${label}" from env sync.`);
          continue;
        }
        await db.update(accountsTable)
          .set({ token, enabled: true, updatedAt: new Date() })
          .where(eq(accountsTable.id, acc.id));
      } else {
        await db.insert(accountsTable).values({ label, token, enabled: true, deleted: false });
      }
    }

    for (const acc of existing) {
      if ((acc as any).deleted) continue; // never touch deleted accounts
      if (!envLabels.has(acc.label) && !(acc as any).manual) {
        await db.update(accountsTable)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(accountsTable.id, acc.id));
      }
    }

    botLog.info(`✅ Accounts synced from env: ${parsed.map((p) => p.label).join(", ")}`);
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.syncEnvAccounts();

    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings || !settings.channelId || !settings.serverId) {
      throw new Error("Bot settings incomplete. Set Server ID and Channel ID first.");
    }

    const accounts = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.enabled, true))
      .then((rows) => rows.filter((a) => !(a as any).deleted));

    if (accounts.length === 0) {
      throw new Error("No enabled accounts found. Add at least one account first.");
    }

    this.running = true;
    this.startTime = Date.now();
    this.totalClaimsToday = 0;
    this.totalScrapToday = 0;
    this.runtimes.clear();
    this.processingNukes.clear();

    botLog.info(`Starting ${accounts.length} account(s)...`);

    await Promise.all(
      accounts.map((acc) => this.connectAccount(acc, settings)),
    );

    this.startAutoTransferScheduler(settings);
  }

  async stop(): Promise<void> {
    botLog.info("Stopping all accounts...");
    if (this.autoTransferTimer) {
      clearInterval(this.autoTransferTimer);
      this.autoTransferTimer = null;
    }
    this.nextAutoTransferAt = null;
    for (const runtime of this.runtimes.values()) {
      runtime.status = "disconnected";
      if (runtime.client) {
        try { runtime.client.destroy(); } catch {}
        runtime.client = null;
      }
    }
    this.running = false;
    this.startTime = null;
    this.runtimes.clear();
    this.processingNukes.clear();
    botLog.info("All accounts stopped.");
  }

  private startAutoTransferScheduler(settings: typeof botSettingsTable.$inferSelect): void {
    if (this.autoTransferTimer) {
      clearInterval(this.autoTransferTimer);
      this.autoTransferTimer = null;
    }

    if (!(settings as any).autoTransferEnabled || !(settings as any).autoTransferRecipient) {
      botLog.info("Auto-transfer disabled — skipping scheduler.");
      this.nextAutoTransferAt = null;
      return;
    }

    const intervalMs = ((settings as any).autoTransferIntervalMin ?? 10) * 60 * 1000;
    this.nextAutoTransferAt = Date.now() + intervalMs;

    botLog.info(
      `⏱ Auto-transfer scheduled every ${(settings as any).autoTransferIntervalMin ?? 10} min → @${(settings as any).autoTransferRecipient}`,
    );

    this.autoTransferTimer = setInterval(async () => {
      const [freshSettings] = await db.select().from(botSettingsTable).limit(1);
      if (!freshSettings || !(freshSettings as any).autoTransferEnabled || !(freshSettings as any).autoTransferRecipient) {
        botLog.info("Auto-transfer disabled in settings — skipping this cycle.");
        this.nextAutoTransferAt = Date.now() + intervalMs;
        return;
      }

      const recipient = (freshSettings as any).autoTransferRecipient as string;
      botLog.info(`⏱ Auto-transfer cycle starting → @${recipient}`);
      await this.runStaggedAutoTransfer(recipient, freshSettings);

      this.nextAutoTransferAt = Date.now() + intervalMs;
    }, intervalMs);
  }

  private async runStaggedAutoTransfer(
    recipient: string,
    settings: typeof botSettingsTable.$inferSelect,
  ): Promise<void> {
    const runtimes = [...this.runtimes.values()].filter(
      (r) => r.status === "connected" && r.client,
    );

    if (runtimes.length === 0) {
      botLog.warn("Auto-transfer: no connected accounts, skipping.");
      return;
    }

    const intervalMs = ((settings as any).autoTransferIntervalMin ?? 10) * 60 * 1000;
    const transferChannelId = (settings as any).transferChannelId || settings.channelId;

    let totalSent = 0;
    let successCount = 0;

    for (let i = 0; i < runtimes.length; i++) {
      const runtime = runtimes[i];

      if (i > 0) {
        botLog.info(
          `⏱ Auto-transfer: waiting ${(settings as any).autoTransferIntervalMin ?? 10} min before next account...`,
        );
        await delay(intervalMs);
      }

      const dbAccount = await db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.id, runtime.accountId))
        .then((rows) => rows[0]);

      const balance = dbAccount?.balance ?? 0;
      if (balance <= 0) {
        botLog.info(`[${runtime.label}] Auto-transfer: balance is 0, skipping.`, runtime.accountId);
        continue;
      }

      botLog.info(
        `[${runtime.label}] Auto-transfer: sending ${balance.toLocaleString()} → @${recipient}`,
        runtime.accountId,
      );

      try {
        const channel = runtime.client!.channels.cache.get(transferChannelId);
        if (!channel || !channel.isText()) throw new Error(`Transfer channel ${transferChannelId} not accessible`);

        const server = (settings as any).transferServer ?? 1;
        await this.sendTransferAndConfirm(
          runtime.client!, channel, settings,
          recipient, balance, server,
          runtime,
        );

        botLog.info(`[${runtime.label}] ✓ Sent ${balance.toLocaleString()} → @${recipient}`, runtime.accountId);

        await db
          .update(accountsTable)
          .set({
            balance: 0,
            totalTransferred: (dbAccount?.totalTransferred ?? 0) + balance,
            updatedAt: new Date(),
          })
          .where(eq(accountsTable.id, runtime.accountId))
          .catch(() => {});

        await db
          .insert(transfersTable)
          .values({
            fromAccountId: runtime.accountId,
            toUsername: recipient,
            amount: balance,
            success: true,
            error: null,
          })
          .catch(() => {});

        totalSent += balance;
        successCount++;
      } catch (err) {
        const errMsg = (err as Error).message;
        botLog.error(`[${runtime.label}] Auto-transfer failed: ${errMsg}`, runtime.accountId);
        await db
          .insert(transfersTable)
          .values({
            fromAccountId: runtime.accountId,
            toUsername: recipient,
            amount: balance,
            success: false,
            error: errMsg,
          })
          .catch(() => {});
      }
    }

    botLog.info(
      `✅ Auto-transfer cycle done. ${successCount}/${runtimes.length} accounts sent ${totalSent.toLocaleString()} scrap to @${recipient}`,
    );
  }

  private async connectAccount(
    account: typeof accountsTable.$inferSelect,
    settings: typeof botSettingsTable.$inferSelect,
  ): Promise<void> {
    const runtime: AccountRuntime = {
      accountId: account.id,
      label: account.label,
      client: null,
      status: "connecting",
      username: account.username,
      claimsThisSession: 0,
      scrapThisSession: 0,
    };
    this.runtimes.set(account.id, runtime);

    botLog.info(`Connecting [${account.label}]...`, account.id);

    const client = new Client();
    runtime.client = client;

    // Single promise covers both client.login() AND the ready event so
    // the timeout is guaranteed to be cleared no matter which path resolves/rejects first.
    // Previously, client.login() throwing early left the 30s timeout dangling → unhandled rejection → crash.
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = (err?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        };

        const timeout = setTimeout(() => done(new Error("Login timeout")), 30000);

        client.once("ready", () => {
          runtime.status = "connected";
          runtime.username = client.user?.username ?? null;

          db.update(accountsTable)
            .set({ username: runtime.username, updatedAt: new Date() })
            .where(eq(accountsTable.id, account.id))
            .catch(() => {});

          botLog.info(`[${account.label}] logged in as ${runtime.username}`, account.id);

          // Randomize presence so accounts don't all appear identical/always-online
          const humanize = (settings as any).humanize ?? true;
          if (humanize) {
            const statuses: Array<"online" | "idle" | "dnd"> = ["online", "online", "online", "idle"];
            const chosenStatus = statuses[Math.floor(Math.random() * statuses.length)];
            try { client.user?.setStatus(chosenStatus); } catch {}

            // Rotate presence every 10–25 minutes to look like a real user
            const rotateStatus = () => {
              if (!runtime.client) return;
              const next = statuses[Math.floor(Math.random() * statuses.length)];
              try { client.user?.setStatus(next); } catch {}
              setTimeout(rotateStatus, (10 + Math.random() * 15) * 60 * 1000);
            };
            setTimeout(rotateStatus, (10 + Math.random() * 15) * 60 * 1000);
          }

          done();
        });

        client.once("error", (err) => done(err));

        // client.login() itself can throw synchronously or return a rejected promise
        client.login(account.token).catch((err: Error) => done(err));
      });
    } catch (err) {
      runtime.status = "error";
      botLog.error(`[${account.label}] login failed: ${(err as Error).message}`, account.id);
      try { client.destroy(); } catch {}
      return;
    }

    // Scan channel history for nukes this account missed
    this.scanAndClaimOldNukes(runtime, settings).catch(() => {});

    // Auto-join configured servers and link to KA0SBOT (fire-and-forget)
    this.joinAndLinkServers(runtime, account, settings).catch((e) => {
      botLog.warn(`[${account.label}] Auto-join/link error: ${(e as Error).message}`, account.id);
    });

    const keywords = settings.nukeKeywords.split(",").map((k) => k.trim()).filter(Boolean);

    const handlePotentialNuke = async (msg: any) => {
      if (!this.running) return;
      if ((msg.channelId ?? msg.channel_id) !== settings.channelId) return;
      if (settings.cloverId && (msg.author?.id ?? msg.author_id) !== settings.cloverId) return;

      const embeds = msg.embeds ?? [];
      const content = msg.content ?? "";

      if (!isNukeMessage(content, embeds, keywords)) return;

      const nukeKey = msg.id;
      if (this.processingNukes.has(nukeKey)) return;
      this.processingNukes.add(nukeKey);

      botLog.info(`🚨 NUKE DETECTED in <#${msg.channelId ?? msg.channel_id}>! Claiming with all accounts...`);

      let nukeEventId: number;
      try {
        const [evt] = await db
          .insert(nukeEventsTable)
          .values({
            messageId: msg.id,
            channelId: msg.channelId ?? msg.channel_id,
            serverId: settings.serverId,
          })
          .returning();
        nukeEventId = evt.id;
      } catch {
        nukeEventId = 0;
      }

      try {
        await this.claimNukeOnAllAccounts(msg, nukeEventId, settings);
      } catch (err) {
        botLog.error(`Unhandled error in claimNukeOnAllAccounts: ${(err as Error).message}`);
      }
    };

    client.on("messageCreate", (msg: Message) => {
      handlePotentialNuke(msg).catch((err) => {
        botLog.error(`messageCreate handler error: ${(err as Error).message}`);
      });
    });

    // Also catch nukes that appear as message edits (some bots update an existing message)
    client.on("messageUpdate", (_old: any, msg: any) => {
      if (!msg || !msg.id) return;
      handlePotentialNuke(msg).catch((err) => {
        botLog.error(`messageUpdate handler error: ${(err as Error).message}`);
      });
    });

    // Also catch nukes via raw WebSocket events (covers interaction-based nuke messages)
    client.on("raw", (packet: any) => {
      if (!this.running) return;
      if (packet.t !== "MESSAGE_UPDATE" && packet.t !== "INTERACTION_CREATE") return;
      const d = packet.d;
      if (!d) return;
      if ((d.channel_id ?? d.channelId) !== settings.channelId) return;
      handlePotentialNuke(d).catch(() => {});
    });

    const handleDisconnect = () => {
      if (!this.running || runtime.status === "disconnected") return;
      runtime.status = "error";
      botLog.warn(`[${account.label}] disconnected — reconnecting in 30s...`, account.id);
      this.scheduleReconnect(account, settings, 30_000);
    };

    client.on("disconnect", handleDisconnect);
    client.on("shardDisconnect", handleDisconnect);
    client.on("invalidated", () => {
      botLog.error(`[${account.label}] session invalidated — reconnecting in 60s...`, account.id);
      runtime.status = "error";
      if (this.running) this.scheduleReconnect(account, settings, 60_000);
    });
  }

  private scheduleReconnect(
    account: typeof accountsTable.$inferSelect,
    settings: typeof botSettingsTable.$inferSelect,
    delayMs: number,
  ): void {
    if (!this.running) return;
    setTimeout(async () => {
      if (!this.running) return;
      botLog.info(`[${account.label}] Reconnecting...`, account.id);
      try {
        await this.connectAccount(account, settings);
      } catch (err) {
        const msg = (err as Error).message;
        botLog.error(`[${account.label}] Reconnect failed: ${msg} — retrying in 60s`, account.id);
        this.scheduleReconnect(account, settings, 60_000);
      }
    }, delayMs);
  }

  private async claimNukeOnAllAccounts(
    triggerMsg: Message,
    nukeEventId: number,
    settings: typeof botSettingsTable.$inferSelect,
  ): Promise<void> {
    const runtimes = [...this.runtimes.values()].filter(
      (r) => r.status === "connected" && r.client,
    );

    let totalScrap = 0;
    let claimCount = 0;
    const skipRate = (settings as any).skipRate ?? 0;
    const humanize = (settings as any).humanize ?? true;

    // Shuffle order so accounts don't always claim in the same sequence
    const shuffled = humanize ? [...runtimes].sort(() => Math.random() - 0.5) : runtimes;

    // Process accounts sequentially with staggered delays (looks more human than all-at-once)
    for (const runtime of shuffled) {
      // Per-account skip rate — occasionally skip an account entirely
      if (skipRate > 0 && Math.random() * 100 < skipRate) {
        botLog.info(`[${runtime.label}] ⏭️ Skipped this nuke (skip rate ${skipRate}%)`, runtime.accountId);
        if (nukeEventId) {
          await db.insert(claimsTable).values({
            nukeEventId,
            accountId: runtime.accountId,
            success: false,
            scrapGained: 0,
            error: "skipped",
          }).catch(() => {});
        }
        continue;
      }

      // Staggered delay between accounts (1–4s apart when humanize is on, claim delay otherwise)
      if (humanize) {
        await randDelay(1000, 4000);
      } else {
        await randDelay(settings.claimDelayMin, settings.claimDelayMax);
      }

      const result = await this.claimNukeForRuntime(runtime, triggerMsg, settings);

      if (result.success) {
        totalScrap += result.scrapGained;
        claimCount++;
        this.totalClaimsToday++;
        this.totalScrapToday += result.scrapGained;
      }

      if (nukeEventId) {
        await db.insert(claimsTable).values({
          nukeEventId,
          accountId: runtime.accountId,
          success: result.success,
          scrapGained: result.scrapGained,
          error: result.alreadyClaimed ? "already_claimed" : result.error,
        }).catch(() => {});
      }
    }

    if (nukeEventId) {
      await db.update(nukeEventsTable)
        .set({ totalScrapClaimed: totalScrap, claimCount })
        .where(eq(nukeEventsTable.id, nukeEventId))
        .catch(() => {});
    }

    botLog.info(`✅ Nuke claimed by ${claimCount}/${runtimes.length} accounts. Total: +${totalScrap.toLocaleString()} clover points`);
  }

  private async claimNukeForRuntime(
    runtime: AccountRuntime,
    triggerMsg: any,
    settings: typeof botSettingsTable.$inferSelect,
  ): Promise<{ success: boolean; scrapGained: number; alreadyClaimed: boolean; error: string | null }> {
    let success = false;
    let scrapGained = 0;
    let alreadyClaimed = false;
    let error: string | null = null;

    try {
      const client = runtime.client!;
      const channelId = triggerMsg.channelId ?? triggerMsg.channel_id ?? settings.channelId;
      const channel = client.channels.cache.get(channelId);
      if (!channel || !channel.isText()) throw new Error("Channel not found for this account");

      let msg: any = null;
      try {
        const fetched = (channel as any).messages.fetch(triggerMsg.id);
        msg = fetched && typeof fetched.then === "function" ? await fetched : fetched;
      } catch {
        // fall back to triggerMsg itself — it already has components when coming from history scan
        msg = triggerMsg ?? null;
      }
      if (!msg && triggerMsg?.components) msg = triggerMsg;
      let interactionSent = false;

      if (msg && msg.components && msg.components.length > 0) {
        const targetServer = String((settings as any).transferServer ?? 1);

        const allComponents: any[] = (msg.components as any[]).flatMap(
          (row: any) => row.components ?? [],
        );

        botLog.info(
          `[${runtime.label}] components: ${allComponents.map((c: any) => `type=${c.type} customId=${c.customId} label=${c.label ?? "-"} disabled=${c.disabled}`).join(" | ")}`,
          runtime.accountId,
        );

        const SELECT_TYPES = ["SELECT_MENU", "STRING_SELECT", "USER_SELECT", "ROLE_SELECT", "MENTIONABLE_SELECT", "CHANNEL_SELECT"];
        const selectComp = allComponents.find(
          (c: any) => (SELECT_TYPES.includes(c.type) || c.type === 3) && !c.disabled,
        );
        const buttonComp = !selectComp
          ? allComponents.find((c: any) => (c.type === "BUTTON" || c.type === 2) && !c.disabled && c.customId)
          : null;

        if (!selectComp && !buttonComp) {
          error = "No interactable component (all buttons disabled or expired)";
          botLog.warn(`[${runtime.label}] no interactable component found`, runtime.accountId);
        } else {
          // Helper: extract text from any response-like object
          const extractText = (r: any): string => {
            if (!r) return "";
            return [
              r.content ?? "",
              ...(r.embeds ?? []).map((e: any) => `${e.title ?? ""} ${e.description ?? ""} ${(e.fields ?? []).map((f: any) => `${f.name} ${f.value}`).join(" ")}`),
            ].join(" ");
          };

          // Shared resolver — called by either the messageCreate listener OR the direct return value
          let _resolveReply!: (v: { amount: number; alreadyClaimed: boolean }) => void;
          let _replyResolved = false;
          const doResolve = (v: { amount: number; alreadyClaimed: boolean }) => {
            if (_replyResolved) return;
            _replyResolved = true;
            _resolveReply(v);
          };

          // CRITICAL: start listening for KA0SBOT's reply BEFORE sending the interaction.
          // We listen on the raw WebSocket packet (not messageCreate) because selfbot-v13
          // sometimes fails to construct the Message object (minValues error), which prevents
          // the messageCreate event from ever being emitted — the raw event always fires.
          const replyPromise = new Promise<{ amount: number; alreadyClaimed: boolean }>((resolve) => {
            _resolveReply = resolve;

            const cleanup = () => {
              client.off("messageCreate", replyHandler);
              client.off("raw", rawHandler);
            };

            const timer = setTimeout(() => {
              cleanup();
              doResolve({ amount: 0, alreadyClaimed: false });
            }, 12000);

            const checkText = (fullText: string) => {
              if (/already\s+claimed/i.test(fullText)) {
                clearTimeout(timer); cleanup();
                doResolve({ amount: 0, alreadyClaimed: true });
                return true;
              }
              // Don't parse the original nuke embed ("Nuke Reward: X") as a claim amount
              if (/nuke\s+reward/i.test(fullText)) return false;
              const parsed = parseScrapFromText(fullText);
              if (parsed > 0) {
                clearTimeout(timer); cleanup();
                doResolve({ amount: parsed, alreadyClaimed: false });
                return true;
              }
              return false;
            };

            // Raw WebSocket fallback — fires even when Message construction fails.
            // Catches MESSAGE_CREATE, MESSAGE_UPDATE, and ephemeral interaction responses.
            const RAW_REPLY_TYPES = new Set([
              "MESSAGE_CREATE",
              "MESSAGE_UPDATE",
              "INTERACTION_SUCCESS",
              "INTERACTION_CREATE",
              "INTERACTION_APPLICATION_COMMAND",
            ]);
            function rawHandler(packet: any) {
              if (!RAW_REPLY_TYPES.has(packet.t)) return;
              const d = packet.d ?? packet;
              if (!d) return;
              // For interaction packets the author may be nested differently
              const authorId = d.author?.id ?? d.member?.user?.id ?? d.user?.id ?? d.application_id;
              if (settings.cloverId && authorId && authorId !== settings.cloverId) return;
              // KA0SBOT ephemeral claim replies arrive as INTERACTION_CREATE with text at:
              //   d.message.content  — regular message in interaction
              //   d.data.content     — ephemeral interaction response body
              //   d.content          — top-level content
              const embeds = (d.message?.embeds ?? d.embeds ?? []) as any[];
              const text = [
                d.message?.content ?? "",
                d.data?.content ?? "",
                d.content ?? "",
                ...embeds.map((e: any) =>
                  `${e.title ?? ""} ${e.description ?? ""} ${(e.fields ?? []).map((f: any) => `${f.name} ${f.value}`).join(" ")}`
                ),
              ].join(" ");
              if (text.trim()) {
                botLog.info(`[${runtime.label}] raw reply (${packet.t}): "${text.slice(0, 200)}"`, runtime.accountId);
                checkText(text);
              }
            }

            // messageCreate fires when Message construction succeeds (simpler nukes)
            function replyHandler(m: any) {
              if (settings.cloverId && m.author.id !== settings.cloverId) return;
              // Don't filter by mentions — KA0SBOT's ephemeral claim reply may not mention the user
              checkText(extractText(m));
            }

            client.on("raw", rawHandler);
            client.on("messageCreate", replyHandler);
          });

          // Now send the interaction
          const humanize = (settings as any).humanize ?? true;
          if (humanize) {
            await randDelay(200, 900);
            try { await (channel as any).sendTyping(); } catch {}
            await randDelay(600, 1800);
          }

          if (selectComp) {
            const options: any[] = selectComp.options ?? [];
            botLog.info(
              `[${runtime.label}] select menu options: ${options.map((o: any) => `${o.label}(${o.value})`).join(", ")}`,
              runtime.accountId,
            );
            const targetOption = options.find((opt: any) =>
              String(opt.value) === targetServer ||
              opt.value?.toLowerCase().includes(targetServer) ||
              opt.label?.toLowerCase().includes(`server ${targetServer}`)
            ) ?? options[0];

            if (targetOption) {
              try {
                // Pass the component object directly (not the customId string) to bypass
                // the broken /[0-4]/ regex in discord.js-selfbot-v13 Message.js that
                // misroutes string customIds containing digits 0-4 into the wrong branch.
                const resp = await msg.selectMenu(selectComp, [targetOption.value]);
                botLog.info(`[${runtime.label}] ✓ selected "${targetOption.label}"`, runtime.accountId);
                interactionSent = true;
                // Try to parse the direct return value (works when KA0SBOT replies ephemerally)
                const respText = extractText(resp);
                if (respText.trim()) {
                  botLog.info(`[${runtime.label}] selectMenu raw resp: "${respText.slice(0, 200)}"`, runtime.accountId);
                  if (/already\s+claimed/i.test(respText)) {
                    doResolve({ amount: 0, alreadyClaimed: true });
                  } else if (!/nuke\s+reward/i.test(respText)) {
                    const parsed = parseScrapFromText(respText);
                    if (parsed > 0) doResolve({ amount: parsed, alreadyClaimed: false });
                  }
                }
              } catch (selErr) {
                const selErrMsg = (selErr as Error).message;
                if (selErrMsg.includes("SELECT_MENU_NOT_FOUND")) {
                  error = "Select menu not found — component expired or nuke already closed";
                  botLog.warn(`[${runtime.label}] select menu not found in message (component may have expired)`, runtime.accountId);
                } else {
                  // Error thrown AFTER Discord received the interaction — still mark sent
                  interactionSent = true;
                  botLog.warn(`[${runtime.label}] selectMenu error (interaction was sent): ${selErrMsg}`, runtime.accountId);
                }
              }
            } else {
              botLog.warn(`[${runtime.label}] no option for server ${targetServer}`, runtime.accountId);
            }
          } else if (buttonComp) {
            try {
              const resp = await msg.clickButton(buttonComp.customId);
              botLog.info(`[${runtime.label}] ✓ clicked button "${buttonComp.label ?? buttonComp.customId}"`, runtime.accountId);
              const respText = extractText(resp);
              if (respText.trim()) {
                botLog.info(`[${runtime.label}] clickButton raw resp: "${respText.slice(0, 200)}"`, runtime.accountId);
                if (/already\s+claimed/i.test(respText)) {
                  doResolve({ amount: 0, alreadyClaimed: true });
                } else {
                  const parsed = parseScrapFromText(respText);
                  if (parsed > 0) doResolve({ amount: parsed, alreadyClaimed: false });
                }
              }
            } catch (btnErr) {
              botLog.warn(`[${runtime.label}] clickButton error (interaction was sent): ${(btnErr as Error).message}`, runtime.accountId);
            }
            interactionSent = true;
          }

          if (interactionSent) {
            const { amount, alreadyClaimed: ac } = await replyPromise;
            if (ac) {
              alreadyClaimed = true;
              botLog.info(`[${runtime.label}] ℹ️ Already claimed this nuke`, runtime.accountId);
            } else if (amount > 0) {
              scrapGained = amount;
              success = true;
              runtime.claimsThisSession++;
              runtime.scrapThisSession += scrapGained;
              botLog.info(`[${runtime.label}] ✓ claimed! +${scrapGained.toLocaleString()} clover points`, runtime.accountId);
              const [dbAcc] = await db.select().from(accountsTable).where(eq(accountsTable.id, runtime.accountId));
              if (dbAcc) {
                await db.update(accountsTable).set({
                  balance: (dbAcc.balance ?? 0) + scrapGained,
                  totalClaimed: (dbAcc.totalClaimed ?? 0) + scrapGained,
                  updatedAt: new Date(),
                }).where(eq(accountsTable.id, runtime.accountId)).catch(() => {});
              }
            } else {
              // Interaction sent but no parseable reply within 12s — still count as claimed
              success = true;
              runtime.claimsThisSession++;
              botLog.info(`[${runtime.label}] ✓ claimed! (amount unknown — no parseable reply)`, runtime.accountId);
            }
          }
        }
      } else if (msg) {
        error = "Nuke message has no components (buttons missing or already removed)";
        botLog.warn(`[${runtime.label}] nuke message has no components`, runtime.accountId);
      } else {
        error = `Could not fetch nuke message ${triggerMsg.id}`;
        botLog.warn(`[${runtime.label}] could not fetch nuke message ${triggerMsg.id}`, runtime.accountId);
      }

      if (!interactionSent && msg && (msg.components?.length ?? 0) > 0) {
        if (!error) error = "Interaction not sent despite having components";
        botLog.warn(`[${runtime.label}] no interaction sent — cannot claim`, runtime.accountId);
      }
    } catch (err) {
      error = (err as Error).message;
      botLog.error(`[${runtime.label}] claim error: ${error}`, runtime.accountId);
    }

    return { success, scrapGained, alreadyClaimed, error };
  }

  private async scanAndClaimOldNukes(
    runtime: AccountRuntime,
    settings: typeof botSettingsTable.$inferSelect,
  ): Promise<void> {
    if (!runtime.client) return;
    await delay(2500); // Let the client fully settle after login

    const channel = runtime.client.channels.cache.get(settings.channelId);
    if (!channel || !(channel as any).isText()) {
      botLog.warn(`[${runtime.label}] Cannot scan for old nukes — channel not accessible`, runtime.accountId);
      return;
    }

    const keywords = settings.nukeKeywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0) return;

    botLog.info(`[${runtime.label}] 🔍 Scanning recent messages for unclaimed nukes...`, runtime.accountId);

    let messages: Map<string, any>;
    try {
      messages = await (channel as any).messages.fetch({ limit: 50 });
    } catch (err) {
      botLog.warn(`[${runtime.label}] Could not fetch channel history: ${(err as Error).message}`, runtime.accountId);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const cutoff48h = now - 48 * 60 * 60; // 48 hours ago

    // Only messages from the clover bot that match nuke keywords, still have an active (non-disabled)
    // component, are within the last 48 hours, AND haven't expired yet
    const nukeMsgs = [...messages.values()].filter((msg: any) => {
      if (settings.cloverId && msg.author.id !== settings.cloverId) return false;
      const embeds = msg.embeds ?? [];
      const content = msg.content ?? "";
      if (!isNukeMessage(content, embeds, keywords)) return false;

      // Must have at least one non-disabled interactable component
      const allComps: any[] = (msg.components ?? []).flatMap((row: any) => row.components ?? []);
      const hasActive = allComps.some(
        (c: any) => !c.disabled && (c.type === 3 || c.type === "STRING_SELECT" || c.type === "SELECT_MENU" || c.type === 2 || c.type === "BUTTON"),
      );
      if (!hasActive) return false;

      // Skip nukes older than 48 hours (based on message creation time)
      const msgTimeSec = msg.createdTimestamp
        ? Math.floor(msg.createdTimestamp / 1000)
        : (msg.createdAt instanceof Date ? Math.floor(msg.createdAt.getTime() / 1000) : now);
      if (msgTimeSec < cutoff48h) return false;

      // Parse expiry from Discord timestamp: <t:1234567890:R>
      const fullText = content + " " + embeds.map((e: any) =>
        `${e.title ?? ""} ${e.description ?? ""} ${(e.fields ?? []).map((f: any) => `${f.name} ${f.value}`).join(" ")}`
      ).join(" ");
      const tsMatch = fullText.match(/<t:(\d+):[^>]*>/);
      if (tsMatch) {
        const expiry = parseInt(tsMatch[1], 10);
        if (expiry < now) return false; // nuke has expired
      }

      return true;
    });

    if (nukeMsgs.length === 0) {
      botLog.info(`[${runtime.label}] No active nukes found in recent history`, runtime.accountId);
      return;
    }

    botLog.info(`[${runtime.label}] Found ${nukeMsgs.length} nuke(s) in history — trying to claim...`, runtime.accountId);

    let claimed = 0;
    let alreadyClaimed = 0;

    for (const msg of nukeMsgs) {
      const result = await this.claimNukeForRuntime(runtime, msg, settings);
      if (result.success) claimed++;
      if (result.alreadyClaimed) alreadyClaimed++;
      if (nukeMsgs.length > 1) await delay(1500);
    }

    botLog.info(
      `[${runtime.label}] Old nuke scan done — claimed: ${claimed}, already claimed: ${alreadyClaimed}, total found: ${nukeMsgs.length}`,
      runtime.accountId,
    );
  }

  // Hot-connect a single account while the bot is already running (e.g. added via UI).
  async hotConnectAccount(accountId: number): Promise<void> {
    if (!this.running) return; // bot not started; will be picked up on next start()
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured.");
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account || !account.enabled) return;
    if (this.runtimes.has(accountId)) return; // already connected
    botLog.info(`[${account.label}] Hot-connecting new account...`, accountId);
    await this.connectAccount(account, settings);
  }

  async transferAll(
    toUsername: string,
    amount: number | null,
    accountIds: number[] | null,
  ): Promise<{ accountId: number; label: string; amount: number; success: boolean; error?: string }[]> {
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured.");

    const runtimesToUse = [...this.runtimes.values()].filter(
      (r) =>
        r.status === "connected" &&
        r.client &&
        (!accountIds || accountIds.includes(r.accountId)),
    );

    if (runtimesToUse.length === 0) {
      throw new Error("No connected accounts available for transfer.");
    }

    botLog.info(
      `💸 Transferring from ${runtimesToUse.length} account(s) to ${toUsername}...`,
    );

    // Use the dedicated transfer channel if set, falling back to the nuke channel
    const transferChannelId = (settings as any).transferChannelId || settings.channelId;
    const isSlashCommand = settings.giveCommand.trim().startsWith("/");
    const slashName = settings.giveCommand.trim().replace(/^\//, "");

    const results = await Promise.all(
      runtimesToUse.map(async (runtime) => {
        let success = false;
        let error: string | undefined;
        let sendAmount = 0;

        try {
          const dbAccount = await db
            .select()
            .from(accountsTable)
            .where(eq(accountsTable.id, runtime.accountId))
            .then((rows) => rows[0]);

          sendAmount = amount ?? dbAccount?.balance ?? 0;
          if (sendAmount <= 0) {
            throw new Error(`No scrap to transfer (balance: ${dbAccount?.balance ?? 0})`);
          }

          const channel = runtime.client!.channels.cache.get(transferChannelId);
          if (!channel || !channel.isText()) {
            throw new Error(`Transfer channel ${transferChannelId} not accessible`);
          }

          const server = (settings as any).transferServer ?? 1;

          botLog.info(`[${runtime.label}] Sending transfer ${sendAmount.toLocaleString()} → @${toUsername}`, runtime.accountId);
          await this.sendTransferAndConfirm(
            runtime.client!, channel, settings,
            toUsername, sendAmount, server,
            runtime,
          );

          botLog.info(`[${runtime.label}] ✓ Transfer sent: ${sendAmount.toLocaleString()} → @${toUsername}`, runtime.accountId);
          success = true;

          await db
            .update(accountsTable)
            .set({
              balance: Math.max(0, (dbAccount?.balance ?? 0) - sendAmount),
              totalTransferred: (dbAccount?.totalTransferred ?? 0) + sendAmount,
              updatedAt: new Date(),
            })
            .where(eq(accountsTable.id, runtime.accountId))
            .catch(() => {});
        } catch (err) {
          error = (err as Error).message;
          botLog.error(`[${runtime.label}] transfer error: ${error}`, runtime.accountId);
        }

        await db
          .insert(transfersTable)
          .values({
            fromAccountId: runtime.accountId,
            toUsername,
            amount: sendAmount,
            success,
            error: error ?? null,
          })
          .catch(() => {});

        return { accountId: runtime.accountId, label: runtime.label, amount: sendAmount, success, error };
      }),
    );

    const total = results.filter((r) => r.success).reduce((s, r) => s + r.amount, 0);
    botLog.info(`💸 Transfer complete. Total sent: ${total} scrap to ${toUsername}`);
    return results;
  }

  connectedCount(): number {
    return [...this.runtimes.values()].filter((r) => r.status === "connected" && r.client).length;
  }

  /** Cleanly disconnect and remove an account from the runtime (called on delete). */
  hotDisconnectAccount(accountId: number): void {
    const runtime = this.runtimes.get(accountId);
    if (!runtime) return;
    runtime.status = "disconnected";
    try { runtime.client?.destroy(); } catch {}
    this.runtimes.delete(accountId);
    botLog.info(`Account #${accountId} removed from runtime.`, accountId);
  }

  /** Trigger join+link for a single account on demand (Relink button). */
  async triggerJoinAndLinkForAccount(accountId: number): Promise<void> {
    const runtime = this.runtimes.get(accountId);
    if (!runtime || runtime.status !== "connected" || !runtime.client) {
      throw new Error("Account is not connected");
    }
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured");
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
      .limit(1);
    if (!account) throw new Error("Account not found");
    await this.joinAndLinkServers(runtime, account, settings);
  }

  /** Called after settings are saved — joins/links any newly added servers on all live accounts. */
  async triggerJoinAndLink(): Promise<void> {
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) return;

    const connected = [...this.runtimes.entries()].filter(
      ([, r]) => r.status === "connected" && r.client,
    );
    if (!connected.length) return;

    const accounts = await db.select().from(accountsTable);

    for (const [accountId, runtime] of connected) {
      const account = accounts.find((a) => a.id === accountId);
      if (!account || !account.enabled) continue;
      this.joinAndLinkServers(runtime, account, settings).catch((e) => {
        botLog.warn(
          `[${account.label}] triggerJoinAndLink error: ${(e as Error).message}`,
          account.id,
        );
      });
      await delay(60_000); // 1 minute between accounts
    }
  }

  /**
   * Sends a transfer slash/text command then waits for KA0SBOT's ephemeral
   * "Confirm transfer" message and clicks the green Confirm button.
   * Throws if the channel send fails; logs a warning if confirm times out.
   */
  private async sendTransferAndConfirm(
    client: any,
    channel: any,
    settings: typeof botSettingsTable.$inferSelect,
    toUsername: string,
    amount: number,
    server: number | string,
    ctx: { label: string; accountId: number },
  ): Promise<void> {
    const isSlash = settings.giveCommand.trim().startsWith('/');
    const slashName = settings.giveCommand.trim().replace(/^\//, '');

    let resolveConfirm!: (v: boolean) => void;
    const confirmPromise = new Promise<boolean>((res) => { resolveConfirm = res; });
    let resolved = false;

    const doResolve = (v: boolean) => {
      if (resolved) return;
      resolved = true;
      resolveConfirm(v);
    };

    const cleanup = () => {
      client.off('messageCreate', onMsg);
      client.off('raw', rawHandler);
    };

    const timer = setTimeout(() => {
      cleanup();
      doResolve(false);
    }, 15_000);

    // Matches 'Confirm Transfer', 'Transfer Confirmation', etc.
    const isConfirmEmbed = (title: string) =>
      /confirm.{0,20}transfer|transfer.{0,20}confirm/i.test(title);

    // Try clicking the Confirm button on a properly-constructed Message object
    const tryClickOnMsg = async (msg: any) => {
      const confirmBtn = (msg.components ?? [])
        .flatMap((r: any) => r.components ?? [])
        .find((c: any) => /confirm/i.test(c.label ?? '') && !c.disabled);
      if (!confirmBtn) return false;
      clearTimeout(timer);
      cleanup();
      botLog.info(`[${ctx.label}] Transfer confirm button found — clicking`, ctx.accountId);
      try {
        await msg.clickButton(confirmBtn.customId ?? confirmBtn.custom_id);
      } catch {
        // Ephemeral interactions often throw even when they succeed
      }
      doResolve(true);
      return true;
    };

    // Raw WebSocket fallback — fires even when Message construction fails.
    // KA0SBOT's 'Confirm Transfer' embed arrives as an ephemeral interaction response
    // (INTERACTION_CREATE / INTERACTION_SUCCESS) which messageCreate often misses.
    const RAW_CONFIRM_TYPES = new Set([
      'MESSAGE_CREATE',
      'INTERACTION_CREATE',
      'INTERACTION_SUCCESS',
      'INTERACTION_APPLICATION_COMMAND',
    ]);

    const rawHandler = async (packet: any) => {
      try {
        if (!RAW_CONFIRM_TYPES.has(packet.t)) return;
        const d = packet.d ?? packet;
        if (!d) return;
        const authorId = d.author?.id ?? d.application_id ?? d.member?.user?.id;
        if (settings.cloverId && authorId && authorId !== settings.cloverId) return;
        // Confirm embed may be at d.embeds (MESSAGE_CREATE) or d.message.embeds (interaction)
        const rawMsg = d.message ?? d;
        const embeds: any[] = rawMsg.embeds ?? d.embeds ?? [];
        const title: string = embeds[0]?.title ?? '';
        if (!isConfirmEmbed(title)) return;
        botLog.info(
          `[${ctx.label}] Transfer confirm embed via raw (${packet.t}): '${title}'`,
          ctx.accountId,
        );
        const rawComponents: any[] = rawMsg.components ?? [];
        const confirmBtn = rawComponents
          .flatMap((r: any) => r.components ?? [])
          .find((c: any) => /confirm/i.test(c.label ?? '') && !c.disabled);
        if (!confirmBtn) return;
        clearTimeout(timer);
        cleanup();
        // Try to fetch the message so we can call clickButton() on it
        const msgId: string | undefined = rawMsg.id ?? d.id;
        if (msgId) {
          try {
            const fetched = await (channel as any).messages.fetch(msgId);
            if (fetched) {
              try { await fetched.clickButton(confirmBtn.custom_id ?? confirmBtn.customId); } catch {}
              doResolve(true);
              return;
            }
          } catch { /* ephemeral messages can't be fetched — fall through */ }
        }
        // Interaction was at least delivered; mark resolved.
        doResolve(true);
      } catch (rawErr) {
        botLog.warn(`[${ctx.label}] Transfer raw handler error: ${(rawErr as Error).message}`);
      }
    };

    // messageCreate fires when Message construction succeeds
    const onMsg = async (msg: any) => {
      try {
        const authorId = msg.author?.id ?? msg.authorId;
        if (settings.cloverId && authorId !== settings.cloverId) return;
        if ((msg.channelId ?? msg.channel_id) !== channel.id) return;
        const embed = msg.embeds?.[0];
        const title: string = embed?.title ?? embed?.data?.title ?? '';
        if (!isConfirmEmbed(title)) return;
        botLog.info(`[${ctx.label}] Transfer confirm embed via messageCreate: '${title}'`, ctx.accountId);
        await tryClickOnMsg(msg);
      } catch (handlerErr) {
        botLog.warn(`[${ctx.label}] Transfer confirm handler error: ${(handlerErr as Error).message}`);
      }
    };

    // Register both listeners BEFORE sending the command
    client.on('raw', rawHandler);
    client.on('messageCreate', onMsg);

    try {
      if (isSlash && settings.cloverId) {
        try {
          await (channel as any).sendSlash(
            settings.cloverId, slashName,
            toUsername, amount, Number(server),
          );
        } catch (slashErr) {
          const slashErrMsg = (slashErr as Error).message ?? '';
          if (/application did not respond/i.test(slashErrMsg)) {
            botLog.warn(
              `[${ctx.label}] sendSlash: '${slashErrMsg}' — interaction was sent; waiting for confirm button`,
              ctx.accountId,
            );
          } else {
            clearTimeout(timer);
            cleanup();
            doResolve(false);
            throw slashErr;
          }
        }
      } else {
        // Text command: no spaces after colons
        const cmd = `${settings.giveCommand} recipient:@${toUsername} amount:${amount} server:${server}`;
        await (channel as any).send(cmd);
      }
    } catch (err) {
      clearTimeout(timer);
      cleanup();
      doResolve(false);
      throw err;
    }

    const confirmed = await confirmPromise;
    if (confirmed) {
      botLog.info(`[${ctx.label}] ✅ Transfer confirmed`, ctx.accountId);
    } else {
      botLog.warn(
        `[${ctx.label}] Transfer command sent but confirm button not received within 15s`,
        ctx.accountId,
      );
    }
  }

  private async joinAndLinkServers(
    runtime: AccountRuntime,
    account: typeof accountsTable.$inferSelect,
    settings: typeof botSettingsTable.$inferSelect,
  ): Promise<void> {
    const raw = settings.autoJoinServers;
    if (!raw || raw === "[]") return;

    let invites: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      invites = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return;
    }
    if (!invites.length) return;

    const client = runtime.client!;
    const ign = account.ign;

    botLog.info(`[${account.label}] Auto-joining ${invites.length} server(s)...`, account.id);

    for (const code of invites) {
      await delay(1000);
      let guildId: string | null = null;

      try {
        const invite = await (client as any).fetchInvite(code).catch(() => null);
        guildId = invite?.guild?.id ?? null;

        if (guildId && client.guilds.cache.has(guildId)) {
          // Already a member — skip silently
        } else {
          await (client as any).acceptInvite(code);
          botLog.info(`[${account.label}] Joined server via ${code}`, account.id);
          await delay(3000);
          if (!guildId) {
            const inv2 = await (client as any).fetchInvite(code).catch(() => null);
            guildId = inv2?.guild?.id ?? null;
          }
        }
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (!/already|10006|Unknown Invite/i.test(msg)) {
          botLog.warn(`[${account.label}] Join ${code} failed: ${msg}`, account.id);
        }
      }

      if (guildId && ign?.trim()) {
        await delay(1500);
        await this.autoLinkInGuild(client, account, settings, guildId, ign.trim()).catch((e) => {
          botLog.warn(`[${account.label}] Auto-link error: ${(e as Error).message}`, account.id);
        });
      }

      await randDelay(3000, 6000);
    }
  }

  private async autoLinkInGuild(
    client: any,
    account: typeof accountsTable.$inferSelect,
    settings: typeof botSettingsTable.$inferSelect,
    guildId: string,
    ign: string,
  ): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const linkCh = guild.channels.cache.find(
      (c: any) => c.isText?.() && /link/i.test(c.name ?? ""),
    ) as any;
    if (!linkCh) {
      botLog.warn(`[${account.label}] No linking channel in "${guild.name}"`, account.id);
      return;
    }

    const msgs: Map<string, any> | null = await linkCh.messages
      .fetch({ limit: 20 })
      .catch(() => null);
    if (!msgs) return;

    let linkMsg: any = null;
    let linkBtnCustomId: string | null = null;
    for (const [, m] of msgs) {
      for (const row of m.components ?? []) {
        for (const c of row.components ?? []) {
          if (/link/i.test(c.label ?? "") || /link/i.test(c.customId ?? "")) {
            linkMsg = m;
            linkBtnCustomId = c.customId;
            break;
          }
        }
        if (linkMsg) break;
      }
      if (linkMsg) break;
    }

    if (!linkMsg || !linkBtnCustomId) {
      botLog.warn(`[${account.label}] No "Link Account" button in "${guild.name}"`, account.id);
      return;
    }

    // Listen for the modal BEFORE clicking the button
    const modalData = await new Promise<{ customId: string; textInputCustomId: string } | null>(
      (resolve) => {
        const timer = setTimeout(() => {
          client.off("raw", onRaw);
          resolve(null);
        }, 10_000);

        function onRaw(packet: any) {
          const d = packet.d ?? packet;
          const rows: any[] = d?.data?.components ?? d?.components ?? [];
          const hasTextInput = rows.some((r: any) =>
            (r.components ?? []).some((c: any) => c.type === 4),
          );
          if (!hasTextInput) return;
          clearTimeout(timer);
          client.off("raw", onRaw);
          const textInput = rows[0]?.components?.[0];
          resolve({
            customId: d?.data?.custom_id ?? d?.custom_id ?? "",
            textInputCustomId: textInput?.custom_id ?? "ign",
          });
        }

        client.on("raw", onRaw);
      },
    );

    // Click the Link Account button (may throw when it opens a modal — expected)
    try {
      await linkMsg.clickButton(linkBtnCustomId);
    } catch {
      // modal-triggering buttons throw in selfbot libs
    }

    if (!modalData) {
      botLog.warn(`[${account.label}] Modal not received in "${guild.name}"`, account.id);
      return;
    }

    // Submit the modal with the IGN
    const sessionId =
      (client as any).ws?.shards?.first()?.sessionId ??
      (client.ws as any)?.sessionId ??
      "";

    try {
      await fetch("https://discord.com/api/v10/interactions", {
        method: "POST",
        headers: { Authorization: account.token, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: 5,
          application_id: settings.cloverId || linkMsg?.applicationId,
          guild_id: guildId,
          channel_id: linkCh.id,
          session_id: sessionId,
          nonce: Date.now().toString(),
          data: {
            custom_id: modalData.customId,
            components: [
              {
                type: 1,
                components: [{ type: 4, custom_id: modalData.textInputCustomId, value: ign }],
              },
            ],
          },
        }),
      });
    } catch (e) {
      botLog.warn(`[${account.label}] Modal submit error: ${(e as Error).message}`, account.id);
      return;
    }

    await delay(2000);

    // Listen for "Confirm Link" button or already-linked / success text
    const confirmResult = await new Promise<"confirmed" | "already_linked" | "timeout">(
      (resolve) => {
        const timer = setTimeout(() => {
          client.off("raw", onRaw);
          resolve("timeout");
        }, 12_000);

        function onRaw(packet: any) {
          const d = packet.d ?? packet;
          const text = extractAllText(d).toLowerCase();

          if (/already.{0,10}linked/i.test(text)) {
            clearTimeout(timer);
            client.off("raw", onRaw);
            resolve("already_linked");
            return;
          }
          if (/successfully.{0,10}link/i.test(text)) {
            clearTimeout(timer);
            client.off("raw", onRaw);
            resolve("confirmed");
            return;
          }

          const allRows: any[] = [
            ...(d?.data?.components ?? []),
            ...(d?.message?.components ?? []),
            ...(d?.components ?? []),
          ];
          const confirmBtn = allRows
            .flatMap((r: any) => r.components ?? [])
            .find((c: any) => /confirm/i.test(c.label ?? ""));
          if (!confirmBtn) return;

          clearTimeout(timer);
          client.off("raw", onRaw);

          const msgId = d?.message?.id ?? d?.id;
          const chId = d?.channel_id ?? d?.message?.channel_id ?? linkCh.id;
          const sid =
            (client as any).ws?.shards?.first()?.sessionId ??
            (client.ws as any)?.sessionId ??
            "";

          fetch("https://discord.com/api/v10/interactions", {
            method: "POST",
            headers: { Authorization: account.token, "Content-Type": "application/json" },
            body: JSON.stringify({
              type: 3,
              application_id: settings.cloverId || linkMsg?.applicationId,
              guild_id: guildId,
              channel_id: chId,
              message_id: msgId,
              session_id: sid,
              message_flags: 64,
              nonce: Date.now().toString(),
              data: { component_type: 2, custom_id: confirmBtn.customId },
            }),
          })
            .then(() => resolve("confirmed"))
            .catch(() => resolve("confirmed"));
        }

        client.on("raw", onRaw);
      },
    );

    if (confirmResult === "already_linked") {
      // skip silently
    } else if (confirmResult === "confirmed") {
      botLog.info(`[${account.label}] ✅ Linked as "${ign}" on "${guild.name}"`, account.id);
    } else {
      botLog.warn(`[${account.label}] Link confirm timed out on "${guild.name}"`, account.id);
    }
  }

  // Refresh the balance of a single account by ID (no inter-account delay).
  async refreshSingleAccount(accountId: number): Promise<number | null> {
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured.");

    const runtime = this.runtimes.get(accountId);
    if (!runtime || runtime.status !== "connected" || !runtime.client) {
      throw new Error(`Account ${accountId} is not connected.`);
    }

    const channelId = (settings as any).transferChannelId || settings.channelId;
    const cloverId = settings.cloverId;
    const client = runtime.client;

    let channel = client.channels.cache.get(channelId) as any;
    if (!channel?.isText?.()) {
      const guildId = (settings as any).serverId;
      if (guildId) channel = client.channels.cache.find((c: any) => c.guildId === guildId && c.isText?.()) as any;
    }
    if (!channel) throw new Error(`No accessible channel for ${runtime.label}`);

    botLog.info(`[${runtime.label}] 💰 Refreshing balance (single)...`, accountId);

    let _resolve!: (v: number | null) => void;
    let _settled = false;
    const settle = (v: number | null) => { if (_settled) return; _settled = true; _resolve(v); };

    const promise = new Promise<number | null>((res) => {
      _resolve = res;
      let handler: (p: any) => void;
      const cleanup = () => client.off("raw", handler);
      const timer = setTimeout(() => { cleanup(); settle(null); }, 10_000);

      handler = (packet: any) => {
        const RAW_TYPES = new Set(["MESSAGE_CREATE","MESSAGE_UPDATE","INTERACTION_CREATE","INTERACTION_SUCCESS","INTERACTION_APPLICATION_COMMAND"]);
        if (!RAW_TYPES.has(packet.t)) return;
        const d = packet.d ?? packet;
        if (!d) return;
        const authorId = d.author?.id ?? d.member?.user?.id ?? d.user?.id;
        if (cloverId && authorId && authorId !== cloverId) return;
        const text = extractAllText(d.message ?? d.data ?? d);
        if (!text.trim()) return;
        botLog.info(`[${runtime.label}] 💰 balance raw (${packet.t}): "${text.slice(0,150)}"`, accountId);
        const parsed = parseBalanceFromText(text);
        if (parsed !== null) { clearTimeout(timer); cleanup(); settle(parsed); }
      };
      client.on("raw", handler);
    });

    try {
      const resp = await (channel as any).sendSlash(cloverId, "balance");
      if (!_settled) {
        for (const c of [resp, resp?.message, resp?.data].filter(Boolean)) {
          const v = parseBalanceFromText(extractAllText(c));
          if (v !== null) { settle(v); break; }
        }
      }
    } catch (e) {
      botLog.warn(`[${runtime.label}] 💰 sendSlash error: ${(e as Error).message}`, accountId);
    }

    const balance = await promise;
    if (balance !== null) {
      await db.update(accountsTable).set({ balance, updatedAt: new Date() })
        .where(eq(accountsTable.id, accountId)).catch(() => {});
      botLog.info(`[${runtime.label}] 💰 Balance updated: ${balance.toLocaleString()}`, accountId);
    } else {
      botLog.warn(`[${runtime.label}] 💰 Could not parse balance reply.`, accountId);
    }
    return balance;
  }

  async refreshBalances(): Promise<{ accountId: number; label: string; balance: number | null; error?: string }[]> {
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured.");

    const runtimes = [...this.runtimes.values()].filter(
      (r) => r.status === "connected" && r.client,
    );
    if (runtimes.length === 0) throw new Error("No connected accounts. Start the bot first.");

    const channelId = (settings as any).transferChannelId || settings.channelId;
    const cloverId = settings.cloverId;

    botLog.info(`💰 Refreshing balances for ${runtimes.length} account(s)...`);

    const results: { accountId: number; label: string; balance: number | null; error?: string }[] = [];

    for (let idx = 0; idx < runtimes.length; idx++) {
      const runtime = runtimes[idx];
      if (idx > 0) await delay(20_000);

      try {
        const client = runtime.client!;

        // Find any accessible text channel — prefer nuke channel, fall back to any cached channel
        let channel = client.channels.cache.get(channelId) as any;
        if (!channel?.isText?.()) {
          // Try any cached text channel in the target guild
          const settings2 = settings as any;
          const guildId = settings2.serverId ?? settings2.guildId ?? settings.serverId;
          if (guildId) {
            channel = client.channels.cache.find(
              (c: any) => c.guildId === guildId && c.isText?.()
            ) as any;
          }
        }
        if (!channel) throw new Error(`No accessible text channel found for ${runtime.label}`);

        botLog.info(`[${runtime.label}] 💰 Sending /balance via sendSlash in channel ${channel.id}...`, runtime.accountId);

        // sendSlash resolves with the empty interaction indicator ("zoktu used /balance"),
        // not the actual ephemeral reply. The real reply arrives via a raw WebSocket packet.
        // Pattern: define cleanup INSIDE the Promise so it can reference the handler (same
        // approach as claimNukeForRuntime — avoids the out-of-scope ReferenceError).
        let _resolveBalance!: (v: number | null) => void;
        let _balanceResolved = false;
        const doResolveBalance = (v: number | null) => {
          if (_balanceResolved) return;
          _balanceResolved = true;
          _resolveBalance(v);
        };

        const balancePromise = new Promise<number | null>((resolve) => {
          _resolveBalance = resolve;

          const BALANCE_RAW_TYPES = new Set([
            "MESSAGE_CREATE",
            "MESSAGE_UPDATE",
            "INTERACTION_CREATE",
            "INTERACTION_SUCCESS",
            "INTERACTION_APPLICATION_COMMAND",
          ]);

          // cleanup lives here so it can close over balanceRawHandler
          let balanceRawHandler: (packet: any) => void;
          const cleanup = () => client.off("raw", balanceRawHandler);

          const timer = setTimeout(() => {
            cleanup();
            botLog.warn(`[${runtime.label}] 💰 Balance reply timed out after 10s`, runtime.accountId);
            doResolveBalance(null);
          }, 10_000);

          balanceRawHandler = (packet: any) => {
            if (!BALANCE_RAW_TYPES.has(packet.t)) return;
            const d = packet.d ?? packet;
            if (!d) return;
            // Filter: must originate from KA0SBOT
            const authorId = d.author?.id ?? d.member?.user?.id ?? d.user?.id;
            if (cloverId && authorId && authorId !== cloverId) return;
            // Check all nested message shapes
            const msgData = d.message ?? d;
            const text = extractAllText(msgData);
            if (!text.trim()) return;
            botLog.info(`[${runtime.label}] 💰 raw balance packet (${packet.t}): "${text.slice(0, 200)}"`, runtime.accountId);
            const parsed = parseBalanceFromText(text);
            if (parsed !== null) {
              clearTimeout(timer);
              cleanup();
              doResolveBalance(parsed);
            }
          };

          client.on("raw", balanceRawHandler);
        });

        // Fire the slash command. Ignore its direct return (it's the indicator message).
        // The real reply arrives via balanceRawHandler. We still check the return as a
        // fast-path in case the library version resolves with actual content.
        try {
          const resp = await (channel as any).sendSlash(cloverId, "balance");
          if (!_balanceResolved) {
            const candidates = [resp, resp?.message, resp?.data, resp?.interaction].filter(Boolean);
            for (const c of candidates) {
              const direct = parseBalanceFromText(extractAllText(c));
              if (direct !== null) {
                botLog.info(`[${runtime.label}] 💰 Got balance from sendSlash direct return: ${direct.toLocaleString()}`, runtime.accountId);
                doResolveBalance(direct);
                break;
              }
            }
          }
          if (!_balanceResolved && resp) {
            try {
              const direct = parseBalanceFromText(JSON.stringify(resp));
              if (direct !== null) {
                botLog.info(`[${runtime.label}] 💰 Got balance from JSON dump: ${direct.toLocaleString()}`, runtime.accountId);
                doResolveBalance(direct);
              }
            } catch {}
          }
        } catch (sendErr) {
          botLog.warn(`[${runtime.label}] 💰 sendSlash threw (interaction may still have fired): ${(sendErr as Error).message}`, runtime.accountId);
        }

        const parsedBalance = await balancePromise;

        if (parsedBalance !== null) {
          await db.update(accountsTable).set({ balance: parsedBalance, updatedAt: new Date() })
            .where(eq(accountsTable.id, runtime.accountId)).catch(() => {});
          botLog.info(`[${runtime.label}] 💰 Balance updated: ${parsedBalance.toLocaleString()}`, runtime.accountId);
        } else {
          botLog.warn(`[${runtime.label}] 💰 Could not parse balance from any source.`, runtime.accountId);
        }

        results.push({ accountId: runtime.accountId, label: runtime.label, balance: parsedBalance });
      } catch (err) {
        const errMsg = (err as Error).message;
        botLog.error(`[${runtime.label}] Balance refresh failed: ${errMsg}`, runtime.accountId);
        results.push({ accountId: runtime.accountId, label: runtime.label, balance: null, error: errMsg });
      }
    }

    const updated = results.filter((r) => r.balance !== null).length;
    botLog.info(`✅ Balance refresh done. Updated ${updated}/${runtimes.length} accounts.`);
    return results;
  }
}

export const nukeBot = new NukeBot();
