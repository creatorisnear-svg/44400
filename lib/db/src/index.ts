import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { ensureSchema as ensureSchemaOn } from "./ensureSchema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create a Postgres database and set DATABASE_URL to its connection string (see README.md).",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/** Creates any missing tables/columns. Safe to run on every start. */
export const ensureSchema = () => ensureSchemaOn(pool);

export * from "./schema";
