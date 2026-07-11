import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gameSessionsTable = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  totalHands: integer("total_hands").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  pushes: integer("pushes").notNull().default(0),
  blackjacks: integer("blackjacks").notNull().default(0),
  scrapNet: integer("scrap_net").notNull().default(0),
  status: text("status").notNull().default("active"),
});

export const insertGameSessionSchema = createInsertSchema(gameSessionsTable).omit({ id: true });
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type GameSession = typeof gameSessionsTable.$inferSelect;
