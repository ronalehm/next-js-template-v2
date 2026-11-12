"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";
import { type Actor, getActor } from "@/lib/auth";
import { can } from "@/lib/roles";
import {
  deleteUserInputSchema,
  editUserInputSchema,
  idInputSchema,
  inviteInputSchema,
  recoverInputSchema,
} from "../schemas/users.schema";
import {
  activateUser,
  countActiveSessions,
  deleteUser,
  inviteUser,
  recoverUserAccess,
  resendInvitation,
  revokeUser,
  safeLogCode,
  updateUser,
  UsersError,
} from "../services/users.service";
import type { ActionResult, SessionsResult } from "../types/users.types";

const GENERIC_ERROR = "No se pudo completar la acción. Inténtalo de nuevo.";

// R47: public entry points. Session, active row and users:manage on every call, then a strict schema.
// Any failure returns the generic message without calling the service; the service repeats the matrix (D37).
async function authorize<T>(schema: z.ZodType<T>, input: unknown): Promise<{ actor: Actor; data: T } | null> {
  const actor = await getActor();
  if (!actor || !can(actor.role, "users:manage")) return null;

  const parsed = schema.safeParse(input);
  return parsed.success ? { actor, data: parsed.data } : null;
}

// D42: only UsersError reaches the user. The log carries only a validated code, never the message, emails or personal data.
function fail(action: string, error: unknown): { ok: false; error: string } {
  console.error(`${action} failed`, { code: safeLogCode((error as { code?: unknown } | null | undefined)?.code) });
  return { ok: false, error: error instanceof UsersError ? error.message : GENERIC_ERROR };
}

async function mutate<T>(
  action: string,
  schema: z.ZodType<T>,
  input: unknown,
  run: (actor: Actor, data: T) => Promise<void>,
): Promise<ActionResult> {
  try {
    const request = await authorize(schema, input);
    if (!request) return { ok: false, error: GENERIC_ERROR };

    await run(request.actor, request.data);
    revalidatePath("/dashboard/users");
    return { ok: true };
  } catch (error) {
    return fail(action, error);
  }
}

// D40: from the request's Origin header (Next compares it with Host for actions), never from the form.
async function signUpUrl(): Promise<string> {
  const origin = (await headers()).get("origin");
  const url = origin && URL.canParse(origin) ? new URL(origin) : null;

  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("Missing or invalid Origin header");
  }

  return `${url.origin}/sign-up`;
}

export async function inviteUserAction(input: unknown): Promise<ActionResult> {
  return mutate("inviteUserAction", inviteInputSchema, input, async (actor, data) =>
    inviteUser(actor, data, await signUpUrl()),
  );
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  return mutate("updateUserAction", editUserInputSchema, input, updateUser);
}

export async function revokeUserAction(input: unknown): Promise<ActionResult> {
  return mutate("revokeUserAction", idInputSchema, input, revokeUser);
}

export async function deleteUserAction(input: unknown): Promise<ActionResult> {
  return mutate("deleteUserAction", deleteUserInputSchema, input, deleteUser);
}

export async function activateUserAction(input: unknown): Promise<ActionResult> {
  return mutate("activateUserAction", idInputSchema, input, activateUser);
}

export async function resendInvitationAction(input: unknown): Promise<ActionResult> {
  return mutate("resendInvitationAction", idInputSchema, input, async (actor, data) =>
    resendInvitation(actor, data, await signUpUrl()),
  );
}

// RN-04: the client sends only the row id (+ identity checkbox); the Clerk id is resolved on the server.
export async function recoverUserAccessAction(input: unknown): Promise<ActionResult> {
  return mutate("recoverUserAccessAction", recoverInputSchema, input, async (actor, data) =>
    recoverUserAccess(actor, data, await signUpUrl()),
  );
}

// D38: read only, no revalidatePath. The client sends the row id; the Clerk id is resolved on the server.
export async function getUserSessionsAction(input: unknown): Promise<SessionsResult> {
  try {
    const request = await authorize(idInputSchema, input);
    if (!request) return { ok: false, error: GENERIC_ERROR };

    return { ok: true, activeSessions: await countActiveSessions(request.actor, request.data) };
  } catch (error) {
    return fail("getUserSessionsAction", error);
  }
}
