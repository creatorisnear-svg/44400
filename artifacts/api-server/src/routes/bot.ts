import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botConfigTable, gameSessionsTable, gameHandsTable } from "@workspace/db/schema";
import { eq, desc, count, sum, sql } from "drizzle-orm";
import { blackjackBot } from "../bot/blackjackBot.js";
import { getLogs } from "../bot/logger.js";

const router: IRouter = Router();

router.get("/bot/config", async (req, res) => {
  const configs = await db.select().from(botConfigTable).limit(1);
  if (!configs.length) {
    const [created] = await db
      .insert(botConfigTable)
      .values({})
      .returning();
    return res.json(created);
  }
  return res.json(configs[0]);
});

router.put("/bot/config", async (req, res) => {
  const body = req.body;
  const configs = await db.select().from(botConfigTable).limit(1);

  if (!configs.length) {
    const [created] = await db
      .insert(botConfigTable)
      .values(body)
      .returning();
    return res.json(created);
  }

  const [updated] = await db
    .update(botConfigTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(botConfigTable.id, configs[0].id))
    .returning();
  return res.json(updated);
});

router.get("/bot/status", (_req, res) => {
  return res.json(blackjackBot.getStatus());
});

router.post("/bot/start", async (req, res) => {
  try {
    await blackjackBot.start();
    return res.json(blackjackBot.getStatus());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start bot";
    req.log.error({ err }, "Bot start failed");
    return res.status(400).json({ error: message });
  }
});

router.post("/bot/stop", async (_req, res) => {
  await blackjackBot.stop();
  return res.json(blackjackBot.getStatus());
});

router.get("/stats", async (_req, res) => {
  const sessions = await db.select().from(gameSessionsTable);
  const hands = await db.select().from(gameHandsTable);

  const totalHands = hands.length;
  const wins = hands.filter((h) => h.result === "win" || h.result === "blackjack").length;
  const losses = hands.filter((h) => h.result === "loss" || h.result === "bust").length;
  const pushes = hands.filter((h) => h.result === "push").length;
  const blackjacks = hands.filter((h) => h.result === "blackjack").length;
  const scrapNet = hands.reduce((sum, h) => sum + (h.scrapDelta ?? 0), 0);
  const winRate = totalHands > 0 ? wins / totalHands : 0;
  const bets = hands.map((h) => h.bet);
  const avgBet = bets.length > 0 ? bets.reduce((a, b) => a + b, 0) / bets.length : 0;

  return res.json({
    totalHands,
    wins,
    losses,
    pushes,
    blackjacks,
    winRate,
    scrapNet,
    totalSessions: sessions.length,
    avgBet,
  });
});

router.get("/sessions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const [{ total }] = await db
    .select({ total: count() })
    .from(gameSessionsTable);
  const sessions = await db
    .select()
    .from(gameSessionsTable)
    .orderBy(desc(gameSessionsTable.startedAt))
    .limit(limit)
    .offset(offset);

  return res.json({ sessions, total });
});

router.get("/sessions/:id/hands", async (req, res) => {
  const id = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const [{ total }] = await db
    .select({ total: count() })
    .from(gameHandsTable)
    .where(eq(gameHandsTable.sessionId, id));
  const hands = await db
    .select()
    .from(gameHandsTable)
    .where(eq(gameHandsTable.sessionId, id))
    .orderBy(desc(gameHandsTable.playedAt))
    .limit(limit)
    .offset(offset);

  return res.json({ hands, total });
});

router.get("/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  return res.json({ logs: getLogs(limit) });
});

export default router;
