import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const nukeEventsTable = pgTable("nuke_events", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  serverId: text("server_id").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  totalScrapClaimed: integer("total_scrap_claimed").notNull().default(0),
  claimCount: integer("claim_count").notNull().default(0),
});

export const claimsTable = pgTable("claims", {
  id: serial("id").primaryKey(),
  nukeEventId: integer("nuke_event_id")
    .notNull()
    .references(() => nukeEventsTable.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accountsTable.id),
  success: boolean("success").notNull().default(false),
  scrapGained: integer("scrap_gained").notNull().default(0),
  error: text("error"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertNukeEventSchema = createInsertSchema(nukeEventsTable).omit({ id: true });
export const insertClaimSchema = createInsertSchema(claimsTable).omit({ id: true });

export type InsertNukeEvent = z.infer<typeof insertNukeEventSchema>;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type NukeEvent = typeof nukeEventsTable.$inferSelect;
export type Claim = typeof claimsTable.$inferSelect;
