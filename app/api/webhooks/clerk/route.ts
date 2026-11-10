import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { recordClerkUserDeleted, userDeletedSchema } from "@/modules/users/server";

export const runtime = "nodejs";

// Logs carry only code/step: never the body, headers, ids, emails or exception messages (RN-10).
function reply(status: number, body: string, log?: { code: string; step?: string }) {
  if (log) console.error({ ...log, status });
  return Response.json({ status: body }, { status });
}

export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim();
  if (!secret) return reply(500, "misconfigured", { code: "missing_secret" });

  let evt;
  try {
    evt = await verifyWebhook(request, { signingSecret: secret });
  } catch {
    return reply(400, "invalid", { code: "invalid_signature" });
  }

  if (evt.type !== "user.deleted") return reply(200, "ignored");

  const parsed = userDeletedSchema.safeParse(evt);
  if (!parsed.success) return reply(200, "ignored", { code: "invalid_payload" });

  try {
    await recordClerkUserDeleted(parsed.data.data.id);
  } catch {
    return reply(500, "retry", { code: "db_error", step: "record" });
  }
  return reply(200, "ok");
}
