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
    /you\s+(?:received?|gained?|got)\s+(\d[\d,]*)\s*(?:scrap|coins?|points?)/i,
    /\+\s*(\d[\d,]*)\s*(?:scrap|coins?|points?)/i,
    /(\d[\d,]*)\s*(?:scrap|coins?|points?)\s+(?:claimed|received?)/i,
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
    };
  }

  async start(): Promise<void> {
    if (this.running) return;

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

    let totalSent = 0;
    let successCount = 0;

    for (const runtime of runtimes) {
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

      const staggerMs = Math.floor(Math.random() * 90_000) + 30_000;
      botLog.info(
        `[${runtime.label}] Auto-transfer: waiting ${Math.round(staggerMs / 1000)}s before sending ${balance.toLocaleString()} scrap...`,
        runtime.accountId,
      );
      await delay(staggerMs);

      try {
        const channel = runtime.client!.channels.cache.get(settings.channelId);
        if (!channel || !channel.isText()) throw new Error("Channel not accessible");

        const server = (settings as any).transferServer ?? 1;
        const cmd = `${settings.giveCommand} recipient:@${recipient} amount: ${balance} server: ${server}`;
        await (channel as any).send(cmd);

        botLog.info(`[${runtime.label}] Auto-transfer sent: ${balance.toLocaleString()} → @${recipient}`, runtime.accountId);

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
      if (runtime.status !== "disconnected") {
        runtime.status = "error";
        botLog.warn(`[${account.label}] disconnected unexpectedly`, account.id);
      }
    });
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

        let success = false;
        let scrapGained = 0;
        let error: string | null = null;

        try {
          const client = runtime.client!;
          const channel = client.channels.cache.get(triggerMsg.channelId);
          if (!channel || !channel.isText()) {
            throw new Error("Channel not found for this account");
          }

          const msg = await (channel as any).messages.fetch(triggerMsg.id).catch(() => null);
          let claimed = false;

          if (msg && msg.components && msg.components.length > 0) {
            for (const row of msg.components) {
              for (const component of (row as MessageActionRow).components) {
                if (component.type === "BUTTON") {
                  try {
                    await (component as MessageButton).click();
                    claimed = true;
                    botLog.info(`[${runtime.label}] clicked claim button ✓`, runtime.accountId);
                    break;
                  } catch (btnErr) {
                    botLog.warn(`[${runtime.label}] button click failed: ${(btnErr as Error).message}`, runtime.accountId);
                  }
                }
              }
              if (claimed) break;
            }
          }

          if (!claimed) {
            const prefix = settings.cloverPrefix ?? "%";
            await (channel as any).send(`${prefix}claim`);
            botLog.info(`[${runtime.label}] sent claim command`, runtime.accountId);
            claimed = true;
          }

          if (claimed) {
            await delay(2500);

            const recent = await (channel as any).messages
              .fetch({ limit: 5 })
              .catch(() => null);

            if (recent) {
              for (const [, m] of recent) {
                if (
                  settings.cloverId && m.author.id !== settings.cloverId
                ) continue;
                const fullText =
                  m.content +
                  " " +
                  m.embeds.map((e: any) => `${e.title ?? ""} ${e.description ?? ""}`).join(" ");
                const userMentioned =
                  !m.mentions?.users?.size ||
                  m.mentions.users.has(client.user?.id ?? "");
                if (userMentioned) {
                  const parsed = parseScrapFromText(fullText);
                  if (parsed > 0) {
                    scrapGained = parsed;
                  }
                }
              }
            }

            success = true;
            runtime.claimsThisSession++;
            runtime.scrapThisSession += scrapGained;
            totalScrap += scrapGained;
            claimCount++;

            botLog.info(
              `[${runtime.label}] claimed nuke! +${scrapGained} scrap`,
              runtime.accountId,
            );

            if (scrapGained > 0) {
              await db
                .update(accountsTable)
                .set({
                  balance: (await db.select().from(accountsTable).where(eq(accountsTable.id, runtime.accountId)))[0]?.balance + scrapGained,
                  totalClaimed: (await db.select().from(accountsTable).where(eq(accountsTable.id, runtime.accountId)))[0]?.totalClaimed + scrapGained,
                  updatedAt: new Date(),
                })
                .where(eq(accountsTable.id, runtime.accountId))
                .catch(() => {});
            }
          }
        } catch (err) {
          error = (err as Error).message;
          botLog.error(`[${runtime.label}] claim error: ${error}`, runtime.accountId);
        }

        if (nukeEventId) {
          await db
            .insert(claimsTable)
            .values({
              nukeEventId,
              accountId: runtime.accountId,
              success,
              scrapGained,
              error,
            })
            .catch(() => {});
        }
      }),
    );

    if (nukeEventId) {
      await db
        .update(nukeEventsTable)
        .set({ totalScrapClaimed: totalScrap, claimCount })
        .where(eq(nukeEventsTable.id, nukeEventId))
        .catch(() => {});
    }

    this.totalClaimsToday += claimCount;
    this.totalScrapToday += totalScrap;

    botLog.info(
      `✅ Nuke claimed by ${claimCount}/${runtimes.length} accounts. Total scrap: +${totalScrap}`,
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
}

export const nukeBot = new NukeBot();
