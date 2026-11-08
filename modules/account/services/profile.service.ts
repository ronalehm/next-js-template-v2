import "server-only";
import { getDb } from "@/lib/db";
import { profileSchema } from "../schemas/profile.schema";
import type { Profile, ProfileFieldKey } from "../types/profile.types";

// Private data (D31, R36): this is the only file that touches user_profiles, always by the actor's id.

type ProfileRow = Record<"phone" | "job_title" | "company" | "birthday" | "website" | "note", unknown>;

const EMPTY_PROFILE: Profile = {
  phone: null,
  jobTitle: null,
  company: null,
  birthday: null,
  website: null,
  note: null,
};

function toProfile(row: ProfileRow): Profile {
  return profileSchema.parse({
    phone: row.phone,
    jobTitle: row.job_title,
    company: row.company,
    birthday: row.birthday,
    website: row.website,
    note: row.note,
  });
}

type Sql = ReturnType<typeof getDb>;

// Closed map: one hand-written statement per field. No column name ever comes from the input.
// Each is a single atomic upsert that only writes its own column (R33).
const SET_FIELD: Record<ProfileFieldKey, (sql: Sql, userId: string, value: string | null) => Promise<unknown[]>> = {
  phone: (sql, userId, value) => sql`
    insert into user_profiles (user_id, phone) values (${userId}, ${value})
    on conflict (user_id) do update set phone = excluded.phone, updated_at = now()
    returning phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  jobTitle: (sql, userId, value) => sql`
    insert into user_profiles (user_id, job_title) values (${userId}, ${value})
    on conflict (user_id) do update set job_title = excluded.job_title, updated_at = now()
    returning phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  company: (sql, userId, value) => sql`
    insert into user_profiles (user_id, company) values (${userId}, ${value})
    on conflict (user_id) do update set company = excluded.company, updated_at = now()
    returning phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  birthday: (sql, userId, value) => sql`
    insert into user_profiles (user_id, birthday) values (${userId}, ${value})
    on conflict (user_id) do update set birthday = excluded.birthday, updated_at = now()
    returning phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  website: (sql, userId, value) => sql`
    insert into user_profiles (user_id, website) values (${userId}, ${value})
    on conflict (user_id) do update set website = excluded.website, updated_at = now()
    returning phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  note: (sql, userId, value) => sql`
    insert into user_profiles (user_id, note) values (${userId}, ${value})
    on conflict (user_id) do update set note = excluded.note, updated_at = now()
    returning phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
};

export async function getOwnProfile(userId: string): Promise<Profile> {
  const sql = getDb();
  const [row] = await sql`
    select phone, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note
    from user_profiles
    where user_id = ${userId}`;

  return row ? toProfile(row as ProfileRow) : { ...EMPTY_PROFILE };
}

export async function setOwnProfileField(
  userId: string,
  field: ProfileFieldKey,
  value: string | null,
): Promise<Profile> {
  if (!Object.hasOwn(SET_FIELD, field)) {
    throw new Error("Unknown profile field");
  }

  const [row] = await SET_FIELD[field](getDb(), userId, value);
  return toProfile(row as ProfileRow);
}
