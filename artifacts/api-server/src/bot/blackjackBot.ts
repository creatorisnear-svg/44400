import { Client } from "discord.js-selfbot-v13";
import { db } from "@workspace/db";
import { botConfigTable, gameSessionsTable, gameHandsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { basicStrategy, cardValue, handValue } from "./strategy.js";
import { botLog } from "./logger.js";

export type BotState =
  | "idle"
  | "connecting"
  | "connected"
  | "starting_game"
  | "playing"
  | "waiting_result"
  | "error";

interface ActiveHand {
  bet: number;
  playerCards: string[];
  dealerCards: string[];
  actions: string[];
  messageId?: string;
  handId?: number;
  canDouble: boolean;
  canSplit: boolean;
}

interface BotStatusData {
  running: boolean;
  connected: boolean;
  sessionId: number | null;
  handsThisSession: number;
  winsThisSession: number;
  lossesThisSession: number;
  scrapThisSession: number;
  currentState: string | null;
  username: string | null;
  uptime: number;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const randomDelay = (min: number, max: number) =>
  delay(Math.floor(Math.random() * (max - min) + min));

function parseCards(text: string): string[] {
  const cards: string[] = [];

  const patterns = [
    /([2-9TJQKA10]{1,2}[♠♥♦♣])/g,
    /([2-9]|10|[TJQKA])\s*of\s*(spades|hearts|diamonds|clubs)/gi,
    /([2-9TJQKA10]{1,2})\s*([SHDCshdc♠♥♦♣])/g,
  ];

  for (const pat of patterns) {
    const matches = [...text.matchAll(pat)];
    if (matches.length > 0) {
      for (const m of matches) cards.push(m[0].trim());
      return cards;
    }
  }

  const words = text.split(/\s+/);
  for (const word of words) {
    if (/^(A|[2-9]|10|J|Q|K)/.test(word)) {
      cards.push(word);
    }
  }
  return cards;
}

function detectResult(
  text: string,
): "win" | "loss" | "push" | "blackjack" | "bust" | null {
  const lower = text.toLowerCase();
  if (lower.includes("blackjack")) return "blackjack";
  if (lower.includes("bust")) return "bust";
  if (lower.includes("win") || lower.includes("won") || lower.includes("profit"))
    return "win";
  if (
    lower.includes("loss") ||
    lower.includes("lost") ||
    lower.includes("lose") ||
    lower.includes("bust")
  )
    return "loss";
  if (lower.includes("push") || lower.includes("tie")) return "push";
  return null;
}

function detectScrapDelta(text: string, bet: number): number {
  const lower = text.toLowerCase();
  const patterns = [
    /[+-]?\s*(\d[\d,]*)\s*scrap/i,
    /won\s+(\d[\d,]*)/i,
    /lost\s+(\d[\d,]*)/i,
    /profit[:\s]+([+-]?\d[\d,]*)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseInt(m[1].replace(/,/g, ""), 10);
      if (lower.includes("lost") || lower.includes("loss")) return -val;
      return val;
    }
  }

  const result = detectResult(text);
  if (result === "blackjack") return Math.floor(bet * 1.5);
  if (result === "win") return bet;
  if (result === "loss" || result === "bust") return -bet;
  if (result === "push") return 0;
  return 0;
}

export class BlackjackBot {
  private client: Client | null = null;
  private running = false;
  private state: BotState = "idle";
  private sessionId: number | null = null;
  private startTime: number | null = null;
  private username: string | null = null;

  private handsThisSession = 0;
  private winsThisSession = 0;
  private lossesThisSession = 0;
  private scrapThisSession = 0;

  private activeHand: ActiveHand | null = null;
  private gamesPlayed = 0;
  private stopRequested = false;
  private gameLoopPromise: Promise<void> | null = null;

  getStatus(): BotStatusData {
    return {
      running: this.running,
      connected: this.client?.isReady() ?? false,
      sessionId: this.sessionId,
      handsThisSession: this.handsThisSession,
      winsThisSession: this.winsThisSession,
      lossesThisSession: this.lossesThisSession,
      scrapThisSession: this.scrapThisSession,
      currentState: this.state,
      username: this.username,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      botLog.warn("Bot already running");
      return;
    }

    const configs = await db.select().from(botConfigTable).limit(1);
    if (!configs.length) {
      throw new Error("No bot configuration found. Please configure the bot first.");
    }
    const config = configs[0];

    if (!config.discordToken) throw new Error("Discord token is not set.");
    if (!config.serverId) throw new Error("Server ID is not set.");
    if (!config.channelId) throw new Error("Channel ID is not set.");

    this.stopRequested = false;
    this.running = true;
    this.startTime = Date.now();
    this.handsThisSession = 0;
    this.winsThisSession = 0;
    this.lossesThisSession = 0;
    this.scrapThisSession = 0;
    this.gamesPlayed = 0;

    const [session] = await db
      .insert(gameSessionsTable)
      .values({ status: "active" })
      .returning();
    this.sessionId = session.id;

    await db
      .update(botConfigTable)
      .set({ enabled: true })
      .where(eq(botConfigTable.id, config.id));

    botLog.info(`Bot session ${this.sessionId} started`);
    this.gameLoopPromise = this.runGameLoop(config);
  }

  async stop(): Promise<void> {
    botLog.info("Stop requested");
    this.stopRequested = true;
    if (this.client) {
      try {
        this.client.destroy();
      } catch {}
      this.client = null;
    }
    if (this.sessionId) {
      await db
        .update(gameSessionsTable)
        .set({ endedAt: new Date(), status: "stopped" })
        .where(eq(gameSessionsTable.id, this.sessionId));
    }
    const configs = await db.select().from(botConfigTable).limit(1);
    if (configs.length) {
      await db
        .update(botConfigTable)
        .set({ enabled: false })
        .where(eq(botConfigTable.id, configs[0].id));
    }
    this.running = false;
    this.state = "idle";
    this.sessionId = null;
    this.startTime = null;
    this.username = null;
    this.activeHand = null;
    botLog.info("Bot stopped");
  }

  private async runGameLoop(config: typeof botConfigTable.$inferSelect): Promise<void> {
    this.state = "connecting";
    botLog.info("Connecting to Discord...");

    this.client = new Client();

    const loginPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Login timed out")), 30000);
      this.client!.once("ready", () => {
        clearTimeout(timeout);
        this.username = this.client!.user?.username ?? null;
        botLog.info(`Logged in as ${this.username}`);
        resolve();
      });
      this.client!.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    try {
      await this.client.login(config.discordToken);
      await loginPromise;
    } catch (err) {
      botLog.error("Failed to connect to Discord", err);
      await this.handleError(err as Error);
      return;
    }

    this.state = "connected";

    const guild = this.client.guilds.cache.get(config.serverId);
    if (!guild) {
      botLog.error(`Server ${config.serverId} not found. Check the Server ID.`);
      await this.stop();
      return;
    }

    const channel = guild.channels.cache.get(config.channelId);
    if (!channel || !channel.isText()) {
      botLog.error(`Channel ${config.channelId} not found or is not a text channel.`);
      await this.stop();
      return;
    }

    botLog.info(`Connected to server: ${guild.name}, channel: ${channel.name}`);

    this.client.on("messageCreate", (msg) => {
      this.handleMessage(msg, config).catch((err) =>
        botLog.error("Error handling message", err),
      );
    });

    this.client.on("messageUpdate", (_old, msg) => {
      if (!msg.partial) {
        this.handleMessage(msg as any, config).catch((err) =>
          botLog.error("Error handling message update", err),
        );
      }
    });

    while (!this.stopRequested) {
      if (config.maxGames && this.gamesPlayed >= config.maxGames) {
        botLog.info(`Reached max games limit (${config.maxGames}). Stopping.`);
        await this.stop();
        break;
      }

      if (config.stopOnLoss && -this.scrapThisSession >= config.stopOnLoss) {
        botLog.info(`Stop-loss triggered (lost ${-this.scrapThisSession} scrap). Stopping.`);
        await this.stop();
        break;
      }

      if (config.stopOnWin && this.scrapThisSession >= config.stopOnWin) {
        botLog.info(`Stop-win triggered (won ${this.scrapThisSession} scrap). Stopping.`);
        await this.stop();
        break;
      }

      try {
        await this.playHand(channel as any, config);
      } catch (err) {
        botLog.error("Error during hand", err);
        await delay(5000);
      }

      const waitMs =
        Math.floor(Math.random() * (config.delayMax - config.delayMin)) +
        config.delayMin;
      botLog.debug(`Waiting ${waitMs}ms before next hand`);
      await delay(waitMs);
    }
  }

  private async playHand(
    channel: any,
    config: typeof botConfigTable.$inferSelect,
  ): Promise<void> {
    this.state = "starting_game";
    this.activeHand = null;

    const prefix = config.kaosPrefix ?? "$";
    const startCmd = `${prefix}blackjack ${config.betAmount}`;
    botLog.info(`Starting hand: ${startCmd}`);

    try {
      await channel.send(startCmd);
    } catch (err) {
      botLog.error("Failed to send blackjack command", err);
      return;
    }

    const [handRow] = await db
      .insert(gameHandsTable)
      .values({
        sessionId: this.sessionId!,
        bet: config.betAmount,
      })
      .returning();

    this.activeHand = {
      bet: config.betAmount,
      playerCards: [],
      dealerCards: [],
      actions: [],
      handId: handRow.id,
      canDouble: true,
      canSplit: true,
    };

    this.state = "playing";
    await delay(3000);

    const timeout = Date.now() + 60000;

    while (!this.stopRequested && Date.now() < timeout) {
      const currentState = this.state as BotState;
      if (currentState === "waiting_result" || currentState === "connected") break;

      if (
        this.activeHand &&
        this.activeHand.playerCards.length >= 2 &&
        this.activeHand.dealerCards.length >= 1
      ) {
        const action = basicStrategy(
          this.activeHand.playerCards,
          this.activeHand.dealerCards[0],
          this.activeHand.canDouble,
          this.activeHand.canSplit,
          config.strategy as any,
        );

        botLog.info(
          `Strategy: ${action} | Player: [${this.activeHand.playerCards.join(", ")}] (${handValue(this.activeHand.playerCards).value}) | Dealer shows: ${this.activeHand.dealerCards[0]}`,
        );

        this.activeHand.actions.push(action);
        this.activeHand.canDouble = false;

        const prefix = config.kaosPrefix ?? "$";
        let cmd = "";
        if (action === "hit") cmd = `${prefix}hit`;
        else if (action === "stand") cmd = `${prefix}stand`;
        else if (action === "double") cmd = `${prefix}doubledown`;
        else if (action === "split") cmd = `${prefix}split`;
        else cmd = `${prefix}stand`;

        await randomDelay(1000, 3000);
        try {
          await channel.send(cmd);
        } catch (err) {
          botLog.error(`Failed to send ${cmd}`, err);
        }

        if (action === "stand" || action === "double") {
          this.state = "waiting_result";
        }

        const { value } = handValue(this.activeHand.playerCards);
        if (value >= 21) {
          this.state = "waiting_result";
        }
      }

      await delay(1500);
    }

    await delay(3000);
    this.gamesPlayed++;
    this.handsThisSession++;
  }

  private async handleMessage(
    msg: any,
    config: typeof botConfigTable.$inferSelect,
  ): Promise<void> {
    if (!this.activeHand) return;
    if (msg.channelId !== config.channelId) return;

    const kaosId = config.kaosUserId;
    if (kaosId && msg.author?.id !== kaosId) return;

    const content = msg.content ?? "";
    const embeds: any[] = msg.embeds ?? [];

    let fullText = content;
    for (const embed of embeds) {
      if (embed.title) fullText += " " + embed.title;
      if (embed.description) fullText += " " + embed.description;
      for (const field of embed.fields ?? []) {
        fullText += " " + field.name + " " + field.value;
      }
      if (embed.footer?.text) fullText += " " + embed.footer.text;
    }

    fullText = fullText.toLowerCase();

    const isAboutBlackjack =
      fullText.includes("blackjack") ||
      fullText.includes("dealer") ||
      fullText.includes("your hand") ||
      fullText.includes("player") ||
      fullText.includes("bust") ||
      fullText.includes("stand") ||
      fullText.includes("hit");

    if (!isAboutBlackjack) return;

    const playerSection = this.extractSection(fullText, [
      "your hand",
      "player",
      "you",
    ]);
    const dealerSection = this.extractSection(fullText, ["dealer", "house"]);

    if (playerSection) {
      const cards = parseCards(playerSection);
      if (cards.length > 0) this.activeHand.playerCards = cards;
    }

    if (dealerSection) {
      const cards = parseCards(dealerSection);
      if (cards.length > 0) this.activeHand.dealerCards = cards;
    }

    if (this.activeHand.playerCards.length === 0) {
      const allCards = parseCards(fullText);
      if (allCards.length >= 2) {
        this.activeHand.playerCards = allCards.slice(0, 2);
        if (allCards.length > 2) {
          this.activeHand.dealerCards = [allCards[2]];
        }
      }
    }

    const result = detectResult(fullText);
    if (result) {
      const scrapDelta = detectScrapDelta(fullText, this.activeHand.bet);

      if (result === "win" || result === "blackjack") this.winsThisSession++;
      else if (result === "loss" || result === "bust") this.lossesThisSession++;
      this.scrapThisSession += scrapDelta;

      botLog.info(
        `Hand result: ${result} | Scrap delta: ${scrapDelta > 0 ? "+" : ""}${scrapDelta} | Session total: ${this.scrapThisSession > 0 ? "+" : ""}${this.scrapThisSession}`,
      );

      if (this.activeHand.handId) {
        await db
          .update(gameHandsTable)
          .set({
            result,
            playerCards: this.activeHand.playerCards,
            dealerCards: this.activeHand.dealerCards,
            actions: this.activeHand.actions,
            scrapDelta,
          })
          .where(eq(gameHandsTable.id, this.activeHand.handId));
      }

      if (this.sessionId) {
        const [session] = await db
          .select()
          .from(gameSessionsTable)
          .where(eq(gameSessionsTable.id, this.sessionId));
        if (session) {
          await db
            .update(gameSessionsTable)
            .set({
              totalHands: session.totalHands + 1,
              wins:
                result === "win" || result === "blackjack"
                  ? session.wins + 1
                  : session.wins,
              losses:
                result === "loss" || result === "bust"
                  ? session.losses + 1
                  : session.losses,
              pushes: result === "push" ? session.pushes + 1 : session.pushes,
              blackjacks:
                result === "blackjack"
                  ? session.blackjacks + 1
                  : session.blackjacks,
              scrapNet: session.scrapNet + scrapDelta,
            })
            .where(eq(gameSessionsTable.id, this.sessionId));
        }
      }

      this.activeHand = null;
      this.state = "connected";
    }
  }

  private extractSection(text: string, keywords: string[]): string {
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx !== -1) {
        return text.slice(idx, idx + 100);
      }
    }
    return "";
  }

  private async handleError(err: Error): Promise<void> {
    this.state = "error";
    botLog.error(`Bot error: ${err.message}`);
    if (this.sessionId) {
      await db
        .update(gameSessionsTable)
        .set({ endedAt: new Date(), status: "error" })
        .where(eq(gameSessionsTable.id, this.sessionId));
    }
    this.running = false;
    this.state = "idle";
  }
}

export const blackjackBot = new BlackjackBot();
