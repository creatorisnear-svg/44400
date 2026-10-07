import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Holds the dashboard password (scrypt hash) when it was created in the
// browser instead of through the DASHBOARD_PASSWORD env var.
export const dashboardAuthTable = pgTable("dashboard_auth", {
  id: serial("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DashboardAuth = typeof dashboardAuthTable.$inferSelect;
