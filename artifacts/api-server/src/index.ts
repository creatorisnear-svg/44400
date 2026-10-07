import app from "./app";
import { logger } from "./lib/logger";
import { nukeBot } from "./bot/nukeBot";
import { db, ensureSchema } from "@workspace/db";
import { accountsTable } from "@workspace/db/schema";
import { announceSetupCode, ensureAuthLoaded } from "./lib/dashboardAuth";

const rawPort = process.env["PORT"] || "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  setImmediate(async () => {
    // Create any missing tables so a brand-new database just works.
    try {
      await ensureSchema();
      logger.info("Database ready");
    } catch (err) {
      logger.error({ err }, "Could not prepare the database. Check DATABASE_URL.");
    }

    await ensureAuthLoaded();
    announceSetupCode(true);

    // Auto-start the bot once the server is up.
    // Checks for at least one enabled account with a token before starting.
    try {
      let hasAccounts = false;
      try {
        const rows = await db.select({ id: accountsTable.id }).from(accountsTable).limit(1);
        hasAccounts = rows.length > 0;
      } catch {
        // DB not ready yet — assume accounts exist
        // so we still attempt to start; nukeBot.start() will handle it gracefully.
        hasAccounts = true;
      }

      if (hasAccounts) {
        logger.info("Auto-starting bot...");
        await nukeBot.start();
        logger.info("Bot auto-started");
      } else {
        logger.info("No accounts configured — skipping auto-start");
      }
    } catch (err) {
      logger.warn({ err }, "Bot auto-start failed — start manually from the dashboard");
    }
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.warn({ reason }, "Unhandled promise rejection (caught at process level — server stays up)");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception (caught at process level — server stays up)");
});
