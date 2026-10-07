import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  accountsTable,
  botSettingsTable,
  nukeEventsTable,
  claimsTable,
  transfersTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { nukeBot } from "../bot/nukeBot.js";
import { getLogs } from "../bot/logger.js";

const router: IRouter = Router();

router.post("/accounts/validate-token", async (req, res) => {
  const { token } = req.body ?? {};
  if (!token || typeof token !== "string") return res.status(400).json({ error: "token is required" });

  try {
    const r = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: token.trim() },
    });
    if (r.status === 401) {
      return res.status(400).json({ error: "Discord says this token doesn't work. Check you copied all of it, or the account may have logged out." });
    }
    if (!r.ok) return res.status(400).json({ error: `Discord rejected the token (${r.status} ${r.statusText}).` });

    const data: any = await r.json();
    const avatarUrl = data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${Number(data.discriminator || 0) % 5}.png`;

    return res.json({ id: data.id, username: data.username, globalName: data.global_name, avatarUrl });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/accounts", async (_req, res) => {
  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.deleted, false))
    .orderBy(accountsTable.id);
  const status = nukeBot.getStatus();
  // Never send tokens back to the browser; the dashboard doesn't need them.
  const accountsWithStatus = accounts.map(({ token, ...acc }) => {
    const runtime = status.accounts.find((a) => a.accountId === acc.id);
    return {
      ...acc,
      hasToken: token.length > 0,
      connected: runtime?.connected ?? false,
      connectionStatus: runtime?.status ?? "disconnected",
    };
  });
  return res.json({ accounts: accountsWithStatus });
});

async function insertAccount(
  token: string,
  opts: { label?: string; enabled?: boolean; username?: string; ign?: string },
): Promise<{ dupe: string } | { created: typeof accountsTable.$inferSelect }> {
  const [dupe] = await db
    .select({ label: accountsTable.label })
    .from(accountsTable)
    .where(and(eq(accountsTable.token, token), eq(accountsTable.deleted, false)))
    .limit(1);
  if (dupe) return { dupe: dupe.label };
  const [created] = await db
    .insert(accountsTable)
    .values({
      label: (opts.label || "Account").trim(),
      token,
      enabled: opts.enabled !== false,
      manual: true,
      deleted: false,
      ...(opts.username ? { username: opts.username.trim() } : {}),
      ...(opts.ign ? { ign: opts.ign.trim() } : {}),
    })
    .returning();
  nukeBot.hotConnectAccount(created.id).catch(() => {});
  return { created };
}

router.post("/accounts", async (req, res) => {
  const { label, token, enabled, username, ign } = req.body;
  if (!token || typeof token !== "string" || !token.trim()) {
    return res.status(400).json({ error: "token is required" });
  }
  const r = await insertAccount(token.trim(), { label, enabled, username, ign });
  if ("dupe" in r) return res.status(409).json({ error: `Already added as "${r.dupe}".` });
  const { token: _t, ...safeCreated } = r.created;
  return res.json(safeCreated);
});

// Log in with email + password (+ 2FA code) and add the account. The password is
// only used for this one request; it is never stored or logged.
const LOGIN_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "X-Discord-Locale": "en-US",
};

router.post("/accounts/login", async (req, res) => {
  const { login, password, code, ticket, label, ign } = req.body ?? {};
  const fail = (error: string, extra: object = {}) => res.status(400).json({ error, ...extra });
  try {
    let token: string | undefined;
    if (ticket && code) {
      const r = await fetch("https://discord.com/api/v9/auth/mfa/totp", {
        method: "POST",
        headers: LOGIN_HEADERS,
        body: JSON.stringify({ code: String(code).replace(/\s/g, ""), ticket, login_source: null, gift_code_sku_id: null }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) {
        return fail(d.message?.includes("Invalid") ? "That code is wrong or expired. Try the next one." : d.message || "The 2FA code was refused.", { needsCode: true, ticket });
      }
      token = d.token;
    } else {
      if (typeof login !== "string" || typeof password !== "string" || !login.trim() || !password) {
        return fail("Enter the account's email (or phone) and password.");
      }
      const r = await fetch("https://discord.com/api/v9/auth/login", {
        method: "POST",
        headers: LOGIN_HEADERS,
        body: JSON.stringify({ login: login.trim(), password, undelete: false, login_source: null, gift_code_sku_id: null }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (d.captcha_key) {
        return fail("Discord wants a captcha for this login, and Halo can't solve those. Log in once in a browser, copy the token, and paste it instead.");
      }
      if (d.mfa && d.ticket) {
        if (!d.totp) return fail("This account uses SMS or a security key for 2FA, which Halo can't use. Paste its token instead.");
        return res.json({ needsCode: true, ticket: d.ticket });
      }
      if (!r.ok || !d.token) {
        const text = JSON.stringify(d);
        if (/INVALID_LOGIN|Login or password is invalid/i.test(text)) return fail("Wrong email or password.");
        if (/ACCOUNT_LOGIN_VERIFICATION_EMAIL|new login location/i.test(text)) {
          return fail("Discord emailed that account a link to approve this new location. Approve it, then try again.");
        }
        return fail(d.message || `Discord refused the login (${r.status}).`);
      }
      token = d.token;
    }

    // Look up who it is so the list shows a real name.
    let username: string | undefined;
    let globalName: string | undefined;
    const me = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: token! } });
    if (me.ok) {
      const u: any = await me.json();
      username = u.username;
      globalName = u.global_name ?? undefined;
    }
    const added = await insertAccount(token!, { label: label || globalName || username, username, ign });
    if ("dupe" in added) return res.status(409).json({ error: `Already added as "${added.dupe}".` });
    return res.json({ ok: true, username, label: added.created.label });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  nukeBot.hotDisconnectAccount(id);
  await db
    .update(accountsTable)
    .set({ deleted: true, enabled: false, updatedAt: new Date() })
    .where(eq(accountsTable.id, id));
  return res.json({ ok: true });
});

router.post("/accounts/:id/relink", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await nukeBot.triggerJoinAndLinkForAccount(id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.put("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { label, token, enabled, ign } = req.body;
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (label !== undefined) updateData.label = label;
  if (token !== undefined) updateData.token = token;
  if (enabled !== undefined) updateData.enabled = enabled;
  if (ign !== undefined) updateData.ign = ign === "" ? null : ign;
  const [updated] = await db
    .update(accountsTable)
    .set(updateData)
    .where(and(eq(accountsTable.id, id), eq(accountsTable.deleted, false)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Account not found" });
  // Apply the on/off switch right away instead of on the next start.
  if (enabled === false) nukeBot.hotDisconnectAccount(id);
  if (enabled === true) nukeBot.hotConnectAccount(id).catch(() => {});
  const { token: _u, ...safeUpdated } = updated;
  return res.json(safeUpdated);
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

  if (body.autoJoinServers !== undefined) {
    nukeBot.triggerJoinAndLink().catch(() => {});
  }

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
  if (!totalAmount || Number(totalAmount) <= 0) return res.status(400).json({ error: "totalAmount must be > 0" });
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

router.get("/servers", (_req, res) => {
  return res.json(nukeBot.listServers());
});

// Accepts full links (discord.gg/abc, discord.com/invite/abc) or bare codes.
const inviteCode = (s: unknown) =>
  String(s ?? "").trim().match(/^(?:https?:\/\/)?(?:(?:www\.)?discord(?:app)?\.(?:gg|com\/invite)\/)?([A-Za-z0-9-]{2,64})\/?$/)?.[1] ?? null;

router.post("/servers/join", async (req, res) => {
  const { invites, accountIds, pace } = req.body ?? {};
  const raw: unknown[] = Array.isArray(invites) ? invites : [];
  const codes = [...new Set(raw.map(inviteCode))];
  if (!codes.length) return res.status(400).json({ error: "Paste at least one invite." });
  if (codes.includes(null)) return res.status(400).json({ error: "One of those isn't an invite link or code." });
  if (codes.length > 10) return res.status(400).json({ error: "Up to 10 invites at a time." });
  const ids = Array.isArray(accountIds) ? accountIds.map(Number).filter(Number.isInteger) : null;
  try {
    await nukeBot.startJoinJob(codes as string[], ids, pace === "quick" ? "quick" : "careful");
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/servers/join/cancel", (_req, res) => {
  nukeBot.cancelJoinJob();
  return res.json({ ok: true });
});

router.post("/accounts/refresh-balances", async (_req, res) => {
  try {
    const count = nukeBot.connectedCount();
    nukeBot.refreshBalances().catch(() => {});
    const minutes = Math.max(0, (count - 1) * 10);
    return res.json({
      ok: true,
      message: `Checking ${count} account${count === 1 ? "" : "s"}, one every 10 minutes. Done in about ${minutes} min.`,
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post("/accounts/:id/refresh-balance", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid account id" });
  try {
    const balance = await nukeBot.refreshSingleAccount(id);
    return res.json({ ok: true, balance });
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
