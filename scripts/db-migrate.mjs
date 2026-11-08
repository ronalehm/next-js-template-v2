// Applies db/migrations/*.sql in name order. Each pending file runs whole
// (never split by ";") in its own transaction, together with its
// schema_migrations record. Stops at the first failure with exit code 1.
// Uses a WebSocket Client (Node >= 22 has a global WebSocket) because the
// HTTP driver cannot run multi-statement files or interactive transactions.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.error("FAIL DATABASE_URL_UNPOOLED y DATABASE_URL no definidas");
  process.exit(1);
}

const migrationsDir = path.join(import.meta.dirname, "..", "db", "migrations");
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const client = new Client(url);

try {
  await client.connect();
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await client.query("select name from schema_migrations");
  const applied = new Set(rows.map((row) => row.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`SKIP ${file}`);
      continue;
    }

    const migration = await readFile(path.join(migrationsDir, file), "utf8");

    try {
      await client.query("begin");
      await client.query(migration);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`OK ${file}`);
    } catch (error) {
      await client.query("rollback").catch(() => {});
      console.error(`FAIL ${file}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
