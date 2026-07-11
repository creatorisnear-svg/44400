import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botConfigTable = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  discordToken: text("discord_token").notNull().default(""),
  serverId: text("server_id").notNull().default(""),
  channelId: text("channel_id").notNull().default(""),
  kaosPrefix: text("kaos_prefix").notNull().default("$"),
  kaosUserId: text("kaos_user_id").notNull().default(""),
  betAmount: integer("bet_amount").notNull().default(100),
  strategy: text("strategy").notNull().default("basic"),
  delayMin: integer("delay_min").notNull().default(2000),
  delayMax: integer("delay_max").notNull().default(5000),
  maxGames: integer("max_games"),
  stopOnLoss: integer("stop_on_loss"),
  stopOnWin: integer("stop_on_win"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBotConfigSchema = createInsertSchema(botConfigTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfigTable.$inferSelect;
