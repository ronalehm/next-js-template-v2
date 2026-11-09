// Usage: npm run db:grant-superadmin -- <email>
// One atomic upsert on the unique email constraint:
// - no row: inserts role superadmin, status invited;
// - row invited/active: sets role superadmin keeping its status (no-op when it
//   already is superadmin, so reruns are idempotent);
// - row revoked: the conflict update is skipped, nothing is returned and the
//   script exits 1 with the row unchanged (D10, R11).
// Access arrives when the user signs in with that verified email (lib/auth.ts).
import { neon } from "@neondatabase/serverless";
import { z } from "zod";

const parsed = z.email().safeParse(process.argv[2]?.trim().toLowerCase());

if (!parsed.success) {
  console.error("FAIL uso: npm run db:grant-superadmin -- <email>");
  process.exit(1);
}

const email = parsed.data;
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  console.error("FAIL DATABASE_URL_UNPOOLED y DATABASE_URL no definidas");
  process.exit(1);
}

const sql = neon(url);

try {
  const rows = await sql.query(
    `insert into app_users (email, role, status)
     values ($1, 'superadmin', 'invited')
     on conflict (email) do update
       set role = 'superadmin',
           updated_at = case when app_users.role = 'superadmin'
                             then app_users.updated_at else now() end
       where app_users.status in ('invited', 'active')
     returning status`,
    [email],
  );

  if (rows.length !== 1) {
    console.error(`FAIL ${email}: la fila está revocada y no se reactiva`);
    process.exit(1);
  }

  console.log(`OK ${email}: superadmin (estado ${rows[0].status})`);
  process.exit(0);
} catch (error) {
  console.error(`FAIL ${email}: ${error.message}`);
  process.exit(1);
}
