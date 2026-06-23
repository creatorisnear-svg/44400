import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  label: text("label").notNull().default("Account"),
  token: text("token").notNull().default(""),
  username: text("username"),
  discriminator: text("discriminator"),
  avatarUrl: text("avatar_url"),
  balance: integer("balance").notNull().default(0),
  totalClaimed: integer("total_claimed").notNull().default(0),
  totalTransferred: integer("total_transferred").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
