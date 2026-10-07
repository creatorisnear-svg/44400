import type pg from "pg";

// Creates any missing tables and columns at startup so a fresh Postgres
// database works without running `drizzle-kit push` by hand. Only ever adds;
// it never drops or changes existing columns. Keep in sync with ./schema.

type Column = [name: string, ddl: string];

interface TableSpec {
  name: string;
  columns: Column[];
  foreignKeys?: [column: string, refTable: string][];
}

const TABLES: TableSpec[] = [
  {
    name: "accounts",
    columns: [
      ["label", "text NOT NULL DEFAULT 'Account'"],
      ["token", "text NOT NULL DEFAULT ''"],
      ["username", "text"],
      ["discriminator", "text"],
      ["avatar_url", "text"],
      ["balance", "integer NOT NULL DEFAULT 0"],
      ["total_claimed", "integer NOT NULL DEFAULT 0"],
      ["total_transferred", "integer NOT NULL DEFAULT 0"],
      ["ign", "text"],
      ["enabled", "boolean NOT NULL DEFAULT true"],
      ["manual", "boolean NOT NULL DEFAULT false"],
      ["deleted", "boolean NOT NULL DEFAULT false"],
      ["created_at", "timestamp NOT NULL DEFAULT now()"],
      ["updated_at", "timestamp NOT NULL DEFAULT now()"],
    ],
  },
  {
    name: "bot_settings",
    columns: [
      ["server_id", "text NOT NULL DEFAULT ''"],
      ["channel_id", "text NOT NULL DEFAULT ''"],
      ["clover_id", "text NOT NULL DEFAULT ''"],
      ["clover_prefix", "text NOT NULL DEFAULT '%'"],
      ["nuke_keywords", "text NOT NULL DEFAULT 'nuclear fallout,nuke,bomb,explosion'"],
      ["give_command", "text NOT NULL DEFAULT '/transfer'"],
      ["claim_delay_min", "integer NOT NULL DEFAULT 300"],
      ["claim_delay_max", "integer NOT NULL DEFAULT 1200"],
      ["transfer_server", "integer NOT NULL DEFAULT 1"],
      ["auto_transfer_enabled", "boolean NOT NULL DEFAULT false"],
      ["auto_transfer_recipient", "text NOT NULL DEFAULT ''"],
      ["auto_transfer_interval_min", "integer NOT NULL DEFAULT 10"],
      ["transfer_channel_id", "text NOT NULL DEFAULT ''"],
      ["auto_join_servers", "text NOT NULL DEFAULT '[]'"],
      ["enabled", "boolean NOT NULL DEFAULT false"],
      ["humanize", "boolean NOT NULL DEFAULT true"],
      ["skip_rate", "integer NOT NULL DEFAULT 0"],
      ["updated_at", "timestamp NOT NULL DEFAULT now()"],
    ],
  },
  {
    name: "nuke_events",
    columns: [
      ["message_id", "text NOT NULL"],
      ["channel_id", "text NOT NULL"],
      ["server_id", "text NOT NULL"],
      ["detected_at", "timestamp NOT NULL DEFAULT now()"],
      ["total_scrap_claimed", "integer NOT NULL DEFAULT 0"],
      ["claim_count", "integer NOT NULL DEFAULT 0"],
    ],
  },
  {
    name: "claims",
    columns: [
      ["nuke_event_id", "integer NOT NULL"],
      ["account_id", "integer NOT NULL"],
      ["success", "boolean NOT NULL DEFAULT false"],
      ["scrap_gained", "integer NOT NULL DEFAULT 0"],
      ["error", "text"],
      ["claimed_at", "timestamp NOT NULL DEFAULT now()"],
    ],
    foreignKeys: [
      ["nuke_event_id", "nuke_events"],
      ["account_id", "accounts"],
    ],
  },
  {
    name: "transfers",
    columns: [
      ["from_account_id", "integer NOT NULL"],
      ["to_username", "text NOT NULL"],
      ["amount", "integer NOT NULL"],
      ["success", "boolean NOT NULL DEFAULT false"],
      ["error", "text"],
      ["sent_at", "timestamp NOT NULL DEFAULT now()"],
    ],
    foreignKeys: [["from_account_id", "accounts"]],
  },
  {
    name: "dashboard_auth",
    columns: [
      ["password_hash", "text NOT NULL"],
      ["updated_at", "timestamp NOT NULL DEFAULT now()"],
    ],
  },
];

function createTableSql(t: TableSpec): string {
  const cols = [`"id" serial PRIMARY KEY`, ...t.columns.map(([n, ddl]) => `"${n}" ${ddl}`)];
  // Constraint names follow drizzle-kit's convention so a later `push` sees no drift.
  for (const [col, ref] of t.foreignKeys ?? []) {
    cols.push(
      `CONSTRAINT "${t.name}_${col}_${ref}_id_fk" FOREIGN KEY ("${col}") REFERENCES "${ref}"("id")`,
    );
  }
  return `CREATE TABLE IF NOT EXISTS "${t.name}" (\n  ${cols.join(",\n  ")}\n)`;
}

export async function ensureSchema(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    for (const t of TABLES) {
      await client.query(createTableSql(t));
      for (const [n, ddl] of t.columns) {
        await client.query(`ALTER TABLE "${t.name}" ADD COLUMN IF NOT EXISTS "${n}" ${ddl}`);
      }
    }
  } finally {
    client.release();
  }
}
