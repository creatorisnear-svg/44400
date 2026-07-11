import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const transfersTable = pgTable("transfers", {
  id: serial("id").primaryKey(),
  fromAccountId: integer("from_account_id")
    .notNull()
    .references(() => accountsTable.id),
  toUsername: text("to_username").notNull(),
  amount: integer("amount").notNull(),
  success: boolean("success").notNull().default(false),
  error: text("error"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertTransferSchema = createInsertSchema(transfersTable).omit({ id: true });
export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type Transfer = typeof transfersTable.$inferSelect;
