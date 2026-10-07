import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

// Read-only lookups that let the setup screens offer pick lists (servers,
// channels, the game bot) instead of asking for copied IDs.

const router: IRouter = Router();
const API = "https://discord.com/api/v10";
const SNOWFLAKE = /^\d{17,20}$/;

class LookupError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function pickAccount(rawId: unknown): Promise<{ token: string; label: string }> {
  const rows = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.deleted, false), eq(accountsTable.enabled, true)))
    .orderBy(accountsTable.id);
  const id = Number(rawId);
  const acc = rawId ? rows.find((r) => r.id === id) : rows[0];
  if (!acc) throw new LookupError(400, "Add an account first. Halo looks through its servers.");
  return { token: acc.token, label: acc.label };
}

async function discordGet(token: string, path: string): Promise<any> {
  const r = await fetch(API + path, { headers: { Authorization: token } });
  if (r.status === 429) {
    const body: any = await r.json().catch(() => ({}));
    throw new LookupError(429, `Discord asked us to slow down. Try again in ${Math.ceil(body.retry_after ?? 5)}s.`);
  }
  if (r.status === 401) {
    throw new LookupError(400, "Discord rejected this account's token. Replace it on the Accounts page.");
  }
  if (r.status === 403 || r.status === 404) {
    throw new LookupError(400, "This account can't see that server or channel.");
  }
  if (!r.ok) throw new LookupError(502, `Discord answered ${r.status} ${r.statusText}.`);
  return r.json();
}

function fail(res: Response, err: unknown) {
  if (err instanceof LookupError) return res.status(err.status).json({ error: err.message });
  return res.status(500).json({ error: (err as Error).message });
}

router.get("/discord/guilds", async (req, res) => {
  try {
    const { token, label } = await pickAccount(req.query.accountId);
    const guilds: any[] = await discordGet(token, "/users/@me/guilds");
    const list = guilds
      .map((g) => ({ id: String(g.id), name: String(g.name ?? g.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ account: label, guilds: list });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/discord/guilds/:guildId/channels", async (req, res) => {
  const { guildId } = req.params;
  if (!SNOWFLAKE.test(guildId)) return res.status(400).json({ error: "That is not a server ID." });
  try {
    const { token } = await pickAccount(req.query.accountId);
    const all: any[] = await discordGet(token, `/guilds/${guildId}/channels`);
    const categories = new Map(all.filter((c) => c.type === 4).map((c) => [c.id, c]));
    // 0 = text, 5 = announcement: the only kinds the game bot posts in.
    const sortKey = (c: any) => {
      const cat = categories.get(c.parent_id);
      return [cat ? cat.position + 1 : 0, c.position ?? 0];
    };
    const channels = all
      .filter((c) => c.type === 0 || c.type === 5)
      .sort((a, b) => {
        const [ca, pa] = sortKey(a);
        const [cb, pb] = sortKey(b);
        return ca - cb || pa - pb;
      })
      .map((c) => ({
        id: String(c.id),
        name: String(c.name),
        category: categories.get(c.parent_id)?.name ?? null,
      }));
    return res.json({ channels });
  } catch (err) {
    return fail(res, err);
  }
});

// Finds the bots that posted recently in a channel, so the game bot can be
// picked by name. Busiest first.
router.get("/discord/channels/:channelId/bots", async (req, res) => {
  const { channelId } = req.params;
  if (!SNOWFLAKE.test(channelId)) return res.status(400).json({ error: "That is not a channel ID." });
  try {
    const { token } = await pickAccount(req.query.accountId);
    const messages: any[] = await discordGet(token, `/channels/${channelId}/messages?limit=50`);
    const bots = new Map<string, { id: string; name: string; count: number }>();
    for (const m of messages) {
      const a = m.author;
      if (!a?.bot) continue;
      const entry = bots.get(a.id) ?? { id: String(a.id), name: String(a.global_name ?? a.username), count: 0 };
      entry.count++;
      bots.set(a.id, entry);
    }
    return res.json({ bots: [...bots.values()].sort((a, b) => b.count - a.count) });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
