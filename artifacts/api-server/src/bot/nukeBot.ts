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

function parseScrapFromText(text: string): number {
  const patterns = [
    // KA0SBOT ephemeral: "Successfully claimed 100,000 clover points on Server 1"
    /successfully\s+claimed\s+(\d[\d,]*)\s*(?:clover\s+)?points?/i,
    /claimed\s+(\d[\d,]*)\s*(?:clover\s+)?points?/i,
    // Generic
    /you\s+(?:received?|gained?|got)\s+(\d[\d,]*)\s*(?:scrap|clover|coins?|points?)/i,
    /\+\s*(\d[\d,]*)\s*(?:scrap|clover|coins?|points?)/i,
    /(\d[\d,]*)\s*(?:clover\s+)?points?\s+(?:claimed|received?)/i,
    /(\d[\d,]*)\s*(?:scrap|coins?)\s+(?:claimed|received?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1].replace(/,/g, ""), 10);
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

        const cmd = `${settings.giveCommand} recipient:@${fo.toUsername} amount: ${step.amount} server: ${server}`;
        await (channel as any).send(cmd);

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

    const existing = await db.select().from(accountsTable);
    const existingByLabel = new Map(existing.map((a) => [a.label, a]));
    const envLabels = new Set(parsed.map((p) => p.label));

    for (const { label, token } of parsed) {
      const acc = existingByLabel.get(label);
      if (acc) {
        await db.update(accountsTable)
          .set({ token, enabled: true, updatedAt: new Date() })
          .where(eq(accountsTable.id, acc.id));
      } else {
        await db.insert(accountsTable).values({ label, token, enabled: true });
      }
    }

    for (const acc of existing) {
      if (!envLabels.has(acc.label)) {
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
      .where(eq(accountsTable.enabled, true));

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
        const cmd = `${settings.giveCommand} recipient:@${recipient} amount: ${balance} server: ${server}`;
        await (channel as any).send(cmd);

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

    const loginPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Login timeout")), 30000);
      client.once("ready", () => {
        clearTimeout(timeout);
        runtime.status = "connected";
        runtime.username = client.user?.username ?? null;

        db.update(accountsTable)
          .set({ username: runtime.username, updatedAt: new Date() })
          .where(eq(accountsTable.id, account.id))
          .catch(() => {});

        botLog.info(`[${account.label}] logged in as ${runtime.username}`, account.id);
        resolve();
      });
      client.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    try {
      await client.login(account.token);
      await loginPromise;
    } catch (err) {
      runtime.status = "error";
      botLog.error(`[${account.label}] login failed: ${(err as Error).message}`, account.id);
      return;
    }

    // Scan channel history for nukes this account missed
    this.scanAndClaimOldNukes(runtime, settings).catch(() => {});

    const keywords = settings.nukeKeywords.split(",").map((k) => k.trim()).filter(Boolean);

    client.on("messageCreate", async (msg: Message) => {
      if (!this.running) return;
      if (msg.channelId !== settings.channelId) return;
      if (settings.cloverId && msg.author.id !== settings.cloverId) return;

      const embeds = msg.embeds ?? [];
      const content = msg.content ?? "";

      if (!isNukeMessage(content, embeds, keywords)) return;

      const nukeKey = msg.id;
      if (this.processingNukes.has(nukeKey)) return;
      this.processingNukes.add(nukeKey);

      botLog.info(`🚨 NUKE DETECTED in <#${msg.channelId}>! Claiming with all accounts...`);

      let nukeEventId: number;
      try {
        const [evt] = await db
          .insert(nukeEventsTable)
          .values({
            messageId: msg.id,
            channelId: msg.channelId,
            serverId: settings.serverId,
          })
          .returning();
        nukeEventId = evt.id;
      } catch {
        nukeEventId = 0;
      }

      await this.claimNukeOnAllAccounts(msg, nukeEventId, settings);
    });

    client.on("disconnect", () => {
      if (!this.running || runtime.status === "disconnected") return;
      runtime.status = "error";
      botLog.warn(`[${account.label}] disconnected — reconnecting in 30s...`, account.id);
      this.scheduleReconnect(account, settings, 30_000);
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

    await Promise.all(
      runtimes.map(async (runtime) => {
        await randDelay(settings.claimDelayMin, settings.claimDelayMax);
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
      }),
    );

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

      const msg = await (channel as any).messages.fetch(triggerMsg.id).catch(() => null);
      let interactionSent = false;

      if (msg && msg.components && msg.components.length > 0) {
        const targetServer = String((settings as any).transferServer ?? 1);

        outer: for (const row of msg.components) {
          for (const component of (row as MessageActionRow).components) {
            const compType = (component as any).type;

            // SELECT_MENU = KA0SBOT "choose server" dropdown
            if (compType === "SELECT_MENU" || compType === 3) {
              try {
                const selectMenu = component as any;
                const options: any[] = selectMenu.options ?? [];
                botLog.info(
                  `[${runtime.label}] select menu: ${options.map((o: any) => `${o.label}(${o.value})`).join(", ")}`,
                  runtime.accountId,
                );
                const targetOption = options.find((opt: any) =>
                  String(opt.value) === targetServer ||
                  opt.value?.toLowerCase().includes(targetServer) ||
                  opt.label?.toLowerCase().includes(`server ${targetServer}`)
                ) ?? options[0];

                if (targetOption) {
                  await selectMenu.select([targetOption.value]);
                  interactionSent = true;
                  botLog.info(`[${runtime.label}] ✓ selected "${targetOption.label}"`, runtime.accountId);
                } else {
                  botLog.warn(`[${runtime.label}] no option for server ${targetServer}`, runtime.accountId);
                }
              } catch (selErr) {
                botLog.warn(`[${runtime.label}] select error: ${(selErr as Error).message}`, runtime.accountId);
              }
              break outer;
            }

            // BUTTON fallback
            if (!interactionSent && (compType === "BUTTON" || compType === 2)) {
              try {
                await (component as MessageButton).click();
                interactionSent = true;
                botLog.info(`[${runtime.label}] ✓ clicked button`, runtime.accountId);
              } catch (btnErr) {
                botLog.warn(`[${runtime.label}] button error: ${(btnErr as Error).message}`, runtime.accountId);
              }
            }
          }
        }
      } else if (msg) {
        botLog.warn(`[${runtime.label}] nuke message has no components`, runtime.accountId);
      } else {
        botLog.warn(`[${runtime.label}] could not fetch nuke message ${triggerMsg.id}`, runtime.accountId);
      }

      if (interactionSent) {
        // KA0SBOT replies ephemerally — catch via messageCreate (not messages.fetch)
        const rawResult = await new Promise<number>((resolve) => {
          const timeoutHandle = setTimeout(() => {
            client.off("messageCreate", handler);
            resolve(0);
          }, 8000);

          function handler(m: any) {
            if (settings.cloverId && m.author.id !== settings.cloverId) return;
            const mentioned = !m.mentions?.users?.size || m.mentions.users.has(client.user?.id ?? "");
            if (!mentioned) return;
            const fullText = (m.content ?? "") + " " +
              (m.embeds ?? []).map((e: any) => `${e.title ?? ""} ${e.description ?? ""}`).join(" ");

            // "Already claimed" response — resolve immediately with sentinel -1
            if (/already\s+claimed/i.test(fullText)) {
              clearTimeout(timeoutHandle);
              client.off("messageCreate", handler);
              resolve(-1);
              return;
            }

            const parsed = parseScrapFromText(fullText);
            if (parsed > 0) {
              clearTimeout(timeoutHandle);
              client.off("messageCreate", handler);
              resolve(parsed);
            }
          }

          client.on("messageCreate", handler);
        });

        if (rawResult === -1) {
          alreadyClaimed = true;
          botLog.info(`[${runtime.label}] ℹ️ Already claimed this nuke`, runtime.accountId);
        } else {
          scrapGained = rawResult;
          success = true;
          runtime.claimsThisSession++;
          runtime.scrapThisSession += scrapGained;
          botLog.info(`[${runtime.label}] ✓ claimed! +${scrapGained.toLocaleString()} clover points`, runtime.accountId);

          if (scrapGained > 0) {
            const [dbAcc] = await db.select().from(accountsTable).where(eq(accountsTable.id, runtime.accountId));
            if (dbAcc) {
              await db.update(accountsTable).set({
                balance: (dbAcc.balance ?? 0) + scrapGained,
                totalClaimed: (dbAcc.totalClaimed ?? 0) + scrapGained,
                updatedAt: new Date(),
              }).where(eq(accountsTable.id, runtime.accountId)).catch(() => {});
            }
          }
        }
      } else {
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

    // Only messages from the clover bot that match nuke keywords AND still have a select menu
    const nukeMsgs = [...messages.values()].filter((msg: any) => {
      if (settings.cloverId && msg.author.id !== settings.cloverId) return false;
      const embeds = msg.embeds ?? [];
      const content = msg.content ?? "";
      if (!isNukeMessage(content, embeds, keywords)) return false;
      return (msg.components?.length ?? 0) > 0;
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

          const channel = runtime.client!.channels.cache.get(settings.channelId);
          if (!channel || !channel.isText()) {
            throw new Error("Channel not accessible");
          }

          const server = (settings as any).transferServer ?? 1;
          const cmd = `${settings.giveCommand} recipient:@${toUsername} amount: ${sendAmount} server: ${server}`;
          await (channel as any).send(cmd);

          botLog.info(`[${runtime.label}] sent: ${cmd}`, runtime.accountId);
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

  async refreshBalances(): Promise<{ accountId: number; label: string; balance: number | null; error?: string }[]> {
    const [settings] = await db.select().from(botSettingsTable).limit(1);
    if (!settings) throw new Error("Bot settings not configured.");

    const runtimes = [...this.runtimes.values()].filter(
      (r) => r.status === "connected" && r.client,
    );
    if (runtimes.length === 0) throw new Error("No connected accounts. Start the bot first.");

    const transferChannelId = (settings as any).transferChannelId || settings.channelId;
    const balanceCmd = "/balance";

    botLog.info(`💰 Refreshing balances for ${runtimes.length} account(s)...`);

    const TEN_MINUTES = 10 * 60 * 1000;

    const results = await Promise.all(
      runtimes.map(async (runtime, idx) => {
        if (idx > 0) await delay(TEN_MINUTES * idx);

        try {
          const channel = runtime.client!.channels.cache.get(transferChannelId);
          if (!channel || !(channel as any).isText()) {
            throw new Error(`Channel ${transferChannelId} not accessible`);
          }

          await (channel as any).send(balanceCmd);
          await delay(3000);

          const recent = await (channel as any).messages.fetch({ limit: 10 }).catch(() => null);
          if (!recent) throw new Error("Could not fetch messages");

          let parsedBalance: number | null = null;
          const cloverId = settings.cloverId;

          for (const [, msg] of recent) {
            if (cloverId && msg.author.id !== cloverId) continue;
            const fullText = [
              msg.content,
              ...msg.embeds.map((e: any) => `${e.title ?? ""} ${e.description ?? ""} ${(e.fields ?? []).map((f: any) => `${f.name} ${f.value}`).join(" ")}`),
            ].join(" ");

            const patterns = [
              /balance[:\s]+(\d[\d,]*)/i,
              /wallet[:\s]+(\d[\d,]*)/i,
              /you\s+have\s+(\d[\d,]*)/i,
              /(\d[\d,]*)\s+clover/i,
              /(\d[\d,]*)\s+scrap/i,
              /(\d[\d,]*)\s+points?/i,
              /\*\*(\d[\d,]*)\*\*/,
              /`(\d[\d,]*)`/,
            ];

            for (const p of patterns) {
              const m = fullText.match(p);
              if (m) {
                const val = parseInt(m[1].replace(/,/g, ""), 10);
                if (!isNaN(val)) { parsedBalance = val; break; }
              }
            }
            if (parsedBalance !== null) break;
          }

          if (parsedBalance !== null) {
            await db.update(accountsTable).set({
              balance: parsedBalance,
              updatedAt: new Date(),
            }).where(eq(accountsTable.id, runtime.accountId)).catch(() => {});
            botLog.info(`[${runtime.label}] 💰 Balance updated: ${parsedBalance.toLocaleString()}`, runtime.accountId);
          } else {
            botLog.warn(`[${runtime.label}] Could not parse balance from bot reply`, runtime.accountId);
          }

          return { accountId: runtime.accountId, label: runtime.label, balance: parsedBalance };
        } catch (err) {
          const errMsg = (err as Error).message;
          botLog.error(`[${runtime.label}] Balance refresh failed: ${errMsg}`, runtime.accountId);
          return { accountId: runtime.accountId, label: runtime.label, balance: null, error: errMsg };
        }
      }),
    );

    const updated = results.filter((r) => r.balance !== null).length;
    botLog.info(`✅ Balance refresh done. Updated ${updated}/${runtimes.length} accounts.`);
    return results;
  }
}

export const nukeBot = new NukeBot();
