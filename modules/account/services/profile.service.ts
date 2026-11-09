import "server-only";
import { getDb } from "@/lib/db";
import { customLabelKey, MAX_CUSTOM_FIELDS, profileSchema } from "../schemas/profile.schema";
import type {
  AddCustomFieldValue,
  CustomField,
  CustomFieldDirection,
  Profile,
  ProfileFieldKey,
  ProfileFieldValue,
  UpdateCustomFieldValue,
} from "../types/profile.types";

// Private data (D31, R36): this is the only file that touches user_profiles, always by the actor's id.

type ProfileRow = Record<"phone" | "phone_type" | "job_title" | "company" | "birthday" | "website" | "note", unknown>;

const EMPTY_PROFILE: Profile = {
  phone: null,
  phoneType: null,
  jobTitle: null,
  company: null,
  birthday: null,
  website: null,
  note: null,
};

function toProfile(row: ProfileRow): Profile {
  return profileSchema.parse({
    phone: row.phone,
    phoneType: row.phone_type,
    jobTitle: row.job_title,
    company: row.company,
    birthday: row.birthday,
    website: row.website,
    note: row.note,
  });
}

type Sql = ReturnType<typeof getDb>;
type FieldValue<K extends ProfileFieldKey> = Extract<ProfileFieldValue, { field: K }>["value"];
type SetField = (sql: Sql, userId: string, value: ProfileFieldValue["value"]) => Promise<unknown[]>;

// Closed map: one hand-written statement per field. No column name ever comes from the input.
// Each is a single atomic upsert that only writes its own columns (R33, R5).
const SET_FIELD: { [K in ProfileFieldKey]: (sql: Sql, userId: string, value: FieldValue<K>) => Promise<unknown[]> } = {
  phone: (sql, userId, value) => sql`
    insert into user_profiles (user_id, phone, phone_type) values (${userId}, ${value?.phone ?? null}, ${value?.type ?? null})
    on conflict (user_id) do update set phone = excluded.phone, phone_type = excluded.phone_type, updated_at = now()
    returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  jobTitle: (sql, userId, value) => sql`
    insert into user_profiles (user_id, job_title) values (${userId}, ${value})
    on conflict (user_id) do update set job_title = excluded.job_title, updated_at = now()
    returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  company: (sql, userId, value) => sql`
    insert into user_profiles (user_id, company) values (${userId}, ${value})
    on conflict (user_id) do update set company = excluded.company, updated_at = now()
    returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  birthday: (sql, userId, value) => sql`
    insert into user_profiles (user_id, birthday) values (${userId}, ${value})
    on conflict (user_id) do update set birthday = excluded.birthday, updated_at = now()
    returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  website: (sql, userId, value) => sql`
    insert into user_profiles (user_id, website) values (${userId}, ${value})
    on conflict (user_id) do update set website = excluded.website, updated_at = now()
    returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
  note: (sql, userId, value) => sql`
    insert into user_profiles (user_id, note) values (${userId}, ${value})
    on conflict (user_id) do update set note = excluded.note, updated_at = now()
    returning phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note`,
};

export async function getOwnProfile(userId: string): Promise<Profile> {
  const sql = getDb();
  const [row] = await sql`
    select phone, phone_type, job_title, company, to_char(birthday, 'YYYY-MM-DD') as birthday, website, note
    from user_profiles
    where user_id = ${userId}`;

  return row ? toProfile(row as ProfileRow) : { ...EMPTY_PROFILE };
}

export async function setOwnProfileField(userId: string, input: ProfileFieldValue): Promise<Profile> {
  if (!Object.hasOwn(SET_FIELD, input.field)) {
    throw new Error("Unknown profile field");
  }

  // The parsed input keeps field and value paired, so the statement for input.field accepts input.value.
  const setField = SET_FIELD[input.field] as SetField;
  const [row] = await setField(getDb(), userId, input.value);
  return toProfile(row as ProfileRow);
}

// --- Custom fields (UX-1) -------------------------------------------------
// Each mutation is one sql.transaction batch: advisory lock + ONE self-contained statement + final list.
// No statement uses the result of another; the service only interprets the results afterwards.

type CustomFieldRow = { id: unknown; label: unknown; value: unknown };

export type CustomFieldsServiceResult =
  | { ok: true; customFields: CustomField[] }
  | { ok: false; reason: "limit" | "duplicate_label" | "not_found" | "conflict" };

const toCustomFields = (rows: unknown[]): CustomField[] =>
  (rows as CustomFieldRow[]).map((row) => ({ id: String(row.id), label: String(row.label), value: String(row.value) }));

const lockQuery = (sql: Sql, userId: string) => sql`select pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`;
const listQuery = (sql: Sql, userId: string) =>
  sql`select id, label, value from user_profile_custom_fields where user_id = ${userId} order by position`;

export async function getOwnCustomFields(userId: string): Promise<CustomField[]> {
  return toCustomFields(await listQuery(getDb(), userId));
}

// Runs [lock, mutation, list]; returns the mutation rows and the final list. Rolls back as a whole on any error.
async function runBatch(userId: string, mutation: (sql: Sql) => ReturnType<Sql>) {
  const sql = getDb();
  const [, mutationRows, listRows] = (await sql.transaction([
    lockQuery(sql, userId),
    mutation(sql),
    listQuery(sql, userId),
  ])) as unknown as unknown[][];
  return { mutationRows, customFields: toCustomFields(listRows) };
}

// 23505 despite the lock: duplicate_label if another field has the same label key, otherwise conflict.
// Only the code is inspected; the message may contain the label (private data).
async function mapUniqueViolation(
  error: unknown,
  userId: string,
  label?: string,
  selfId?: string,
): Promise<CustomFieldsServiceResult> {
  if ((error as { code?: unknown } | null)?.code !== "23505") throw error;
  if (label !== undefined) {
    const key = customLabelKey(label);
    const current = await getOwnCustomFields(userId);
    if (current.some((field) => field.id !== selfId && customLabelKey(field.label) === key)) {
      return { ok: false, reason: "duplicate_label" };
    }
  }
  return { ok: false, reason: "conflict" };
}

export async function addOwnCustomField(userId: string, input: AddCustomFieldValue): Promise<CustomFieldsServiceResult> {
  try {
    const { mutationRows, customFields } = await runBatch(
      userId,
      (sql) => sql`
        insert into user_profile_custom_fields (user_id, label, value, position)
        select ${userId}, ${input.label}, ${input.value}, count(*) + 1
        from user_profile_custom_fields where user_id = ${userId}
        having count(*) < ${MAX_CUSTOM_FIELDS}
        returning id`,
    );
    return mutationRows.length === 0 ? { ok: false, reason: "limit" } : { ok: true, customFields };
  } catch (error) {
    return mapUniqueViolation(error, userId, input.label);
  }
}

export async function updateOwnCustomField(
  userId: string,
  input: UpdateCustomFieldValue,
): Promise<CustomFieldsServiceResult> {
  try {
    const { mutationRows, customFields } = await runBatch(
      userId,
      (sql) => sql`
        update user_profile_custom_fields set label = ${input.label}, value = ${input.value}, updated_at = now()
        where id = ${input.id} and user_id = ${userId}
        returning id`,
    );
    return mutationRows.length === 0 ? { ok: false, reason: "not_found" } : { ok: true, customFields };
  } catch (error) {
    return mapUniqueViolation(error, userId, input.label, input.id);
  }
}

export async function deleteOwnCustomField(userId: string, id: string): Promise<CustomFieldsServiceResult> {
  try {
    const { mutationRows, customFields } = await runBatch(
      userId,
      (sql) => sql`
        with d as (delete from user_profile_custom_fields where id = ${id} and user_id = ${userId} returning position),
        u as (update user_profile_custom_fields set position = position - 1, updated_at = now()
          where user_id = ${userId} and position > (select position from d))
        select count(*)::int as deleted from d`,
    );
    const deleted = (mutationRows[0] as { deleted?: number } | undefined)?.deleted ?? 0;
    return deleted === 0 ? { ok: false, reason: "not_found" } : { ok: true, customFields };
  } catch (error) {
    return mapUniqueViolation(error, userId);
  }
}

// Closed map: delta never comes from the input.
const MOVE_DELTA: Record<CustomFieldDirection, number> = { up: -1, down: 1 };

export async function moveOwnCustomField(
  userId: string,
  id: string,
  direction: CustomFieldDirection,
): Promise<CustomFieldsServiceResult> {
  const delta = MOVE_DELTA[direction];
  try {
    const { customFields } = await runBatch(
      userId,
      (sql) => sql`
        with t as (select id, position as p from user_profile_custom_fields where id = ${id} and user_id = ${userId})
        update user_profile_custom_fields
        set position = case when id = (select id from t) then position + ${delta}::int else position - ${delta}::int end,
            updated_at = now()
        where user_id = ${userId}
          and position in ((select p from t), (select p from t) + ${delta}::int)
          and (select count(*) from user_profile_custom_fields where user_id = ${userId} and position = (select p from t) + ${delta}::int) = 1`,
    );
    // Foreign or missing id: not in the actor's list. At an end the id is there and nothing changed.
    return customFields.some((field) => field.id === id)
      ? { ok: true, customFields }
      : { ok: false, reason: "not_found" };
  } catch (error) {
    return mapUniqueViolation(error, userId);
  }
}
