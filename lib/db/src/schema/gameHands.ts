import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gameSessionsTable } from "./gameSessions";

export const gameHandsTable = pgTable("game_hands", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => gameSessionsTable.id),
  bet: integer("bet").notNull(),
  result: text("result"),
  playerCards: text("player_cards").array(),
  dealerCards: text("dealer_cards").array(),
  actions: text("actions").array(),
  scrapDelta: integer("scrap_delta"),
  playedAt: timestamp("played_at").notNull().defaultNow(),
});

export const insertGameHandSchema = createInsertSchema(gameHandsTable).omit({ id: true });
export type InsertGameHand = z.infer<typeof insertGameHandSchema>;
export type GameHand = typeof gameHandsTable.$inferSelect;
