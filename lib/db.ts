import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { z } from "zod";

const databaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL is required")
  .refine(
    (value) =>
      value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must be a Postgres connection string",
  );

type Database = NeonQueryFunction<false, false>;

let client: Database | undefined;

export function getDb(): Database {
  if (!client) {
    client = neon(databaseUrlSchema.parse(process.env.DATABASE_URL));
  }

  return client;
}

export async function checkDatabaseConnection() {
  const sql = getDb();
  const rows =
    await sql`select 1 as ok, current_database() as database, current_user as "user"`;

  return rows[0] as { ok: number; database: string; user: string };
}
