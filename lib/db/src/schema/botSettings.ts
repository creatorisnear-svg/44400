import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botSettingsTable = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().default(""),
  channelId: text("channel_id").notNull().default(""),
  cloverId: text("clover_id").notNull().default(""),
  cloverPrefix: text("clover_prefix").notNull().default("%"),
  nukeKeywords: text("nuke_keywords").notNull().default("nuclear fallout,nuke,bomb,explosion"),
  giveCommand: text("give_command").notNull().default("/transfer"),
  claimDelayMin: integer("claim_delay_min").notNull().default(300),
  claimDelayMax: integer("claim_delay_max").notNull().default(1200),
  transferServer: integer("transfer_server").notNull().default(1),
  autoTransferEnabled: boolean("auto_transfer_enabled").notNull().default(false),
  autoTransferRecipient: text("auto_transfer_recipient").notNull().default(""),
  autoTransferIntervalMin: integer("auto_transfer_interval_min").notNull().default(10),
  transferChannelId: text("transfer_channel_id").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  humanize: boolean("humanize").notNull().default(true),
  skipRate: integer("skip_rate").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBotSettingsSchema = createInsertSchema(botSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type BotSettings = typeof botSettingsTable.$inferSelect;
