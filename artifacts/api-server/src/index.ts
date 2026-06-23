import app from "./app";
import { logger } from "./lib/logger";
import { nukeBot } from "./bot/nukeBot";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db/schema";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Auto-start the bot once the server is up.
  // Checks for at least one enabled account with a token before starting.
  setImmediate(async () => {
    try {
      let hasAccounts = false;
      try {
        const rows = await db.select({ id: accountsTable.id }).from(accountsTable).limit(1);
        hasAccounts = rows.length > 0;
      } catch {
        // DB not ready yet (e.g. schema not pushed in dev) — assume accounts exist
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
