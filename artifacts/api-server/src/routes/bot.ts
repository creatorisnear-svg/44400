import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  accountsTable,
  botSettingsTable,
  nukeEventsTable,
  claimsTable,
  transfersTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { nukeBot } from "../bot/nukeBot.js";
import { getLogs } from "../bot/logger.js";

const router: IRouter = Router();

router.get("/accounts", async (_req, res) => {
  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.id);
  const status = nukeBot.getStatus();
  const accountsWithStatus = accounts.map((acc) => {
    const runtime = status.accounts.find((a) => a.accountId === acc.id);
    return {
      ...acc,
      connected: runtime?.connected ?? false,
      connectionStatus: runtime?.status ?? "disconnected",
    };
  });
  return res.json({ accounts: accountsWithStatus });
});

router.post("/accounts", async (req, res) => {
  const { label, token, enabled } = req.body;
  const [created] = await db
    .insert(accountsTable)
    .values({ label: label ?? "Account", token, enabled: enabled !== false })
    .returning();
  return res.json(created);
});

router.put("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { label, token, enabled } = req.body;
  const [updated] = await db
    .update(accountsTable)
    .set({ label, token, enabled, updatedAt: new Date() })
    .where(eq(accountsTable.id, id))
    .returning();
  return res.json(updated);
});

router.delete("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(accountsTable).where(eq(accountsTable.id, id));
  return res.json({ ok: true });
});

router.get("/bot/settings", async (_req, res) => {
  const [settings] = await db.select().from(botSettingsTable).limit(1);
  if (!settings) {
    const [created] = await db.insert(botSettingsTable).values({}).returning();
    return res.json(created);
  }
  return res.json(settings);
});

router.put("/bot/settings", async (req, res) => {
  const body = req.body;
  const [existing] = await db.select().from(botSettingsTable).limit(1);
  if (!existing) {
    const [created] = await db.insert(botSettingsTable).values(body).returning();
    return res.json(created);
  }
  const [updated] = await db
    .update(botSettingsTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(botSettingsTable.id, existing.id))
    .returning();
  return res.json(updated);
});

router.get("/bot/status", (_req, res) => {
  return res.json(nukeBot.getStatus());
});

router.post("/bot/start", async (req, res) => {
  try {
    await nukeBot.start();
    return res.json(nukeBot.getStatus());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start";
    req.log.error({ err }, "Bot start failed");
    return res.status(400).json({ error: message });
  }
});

router.post("/bot/stop", async (_req, res) => {
  await nukeBot.stop();
  return res.json(nukeBot.getStatus());
});

router.post("/transfer", async (req, res) => {
  const { toUsername, amount, accountIds } = req.body;
  if (!toUsername) return res.status(400).json({ error: "toUsername is required" });
  try {
    const results = await nukeBot.transferAll(toUsername, amount ?? null, accountIds ?? null);
    const totalTransferred = results.filter((r) => r.success).reduce((s, r) => s + r.amount, 0);
    return res.json({ results, totalTransferred });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/transfer/fill", async (req, res) => {
  const { toUsername, totalAmount } = req.body;
  if (!toUsername) return res.status(400).json({ error: "toUsername is required" });
  if (!totalAmount || totalAmount <= 0) return res.status(400).json({ error: "totalAmount must be > 0" });
  try {
    await nukeBot.startFillOrder(toUsername, Number(totalAmount));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/transfer/fill/cancel", async (_req, res) => {
  nukeBot.cancelFillOrder();
  return res.json({ ok: true });
});

router.post("/accounts/refresh-balances", async (_req, res) => {
  try {
    const count = nukeBot.connectedCount();
    nukeBot.refreshBalances().catch(() => {});
    const minutes = Math.max(0, (count - 1) * 10);
    return res.json({
      ok: true,
      message: `Balance refresh started for ${count} account(s). Each /balance is 10 min apart — all done in ~${minutes} min.`,
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/transfers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await db
    .select({
      id: transfersTable.id,
      fromAccountId: transfersTable.fromAccountId,
      fromLabel: accountsTable.label,
      toUsername: transfersTable.toUsername,
      amount: transfersTable.amount,
      success: transfersTable.success,
      error: transfersTable.error,
      sentAt: transfersTable.sentAt,
    })
    .from(transfersTable)
    .leftJoin(accountsTable, eq(transfersTable.fromAccountId, accountsTable.id))
    .orderBy(desc(transfersTable.sentAt))
    .limit(limit);
  return res.json({ transfers: rows });
});

router.get("/events", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await db
    .select()
    .from(nukeEventsTable)
    .orderBy(desc(nukeEventsTable.detectedAt))
    .limit(limit);

  const withClaims = await Promise.all(
    events.map(async (evt) => {
      const claims = await db
        .select({
          accountId: claimsTable.accountId,
          label: accountsTable.label,
          success: claimsTable.success,
          scrapGained: claimsTable.scrapGained,
          error: claimsTable.error,
        })
        .from(claimsTable)
        .leftJoin(accountsTable, eq(claimsTable.accountId, accountsTable.id))
        .where(eq(claimsTable.nukeEventId, evt.id));
      return { ...evt, claims };
    }),
  );

  return res.json({ events: withClaims });
});

router.get("/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  return res.json({ logs: getLogs(limit) });
});

export default router;
