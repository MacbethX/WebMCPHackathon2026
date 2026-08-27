/**
 * Server-side revalidation for sandbox mutations (CLAUDE.md rule 8).
 *
 * Arguments are validated again here, at the boundary, regardless of what the tool's
 * inputSchema claimed. A schema is a hint to the agent, not a guarantee: the agent may
 * ignore it, and nothing stops a caller from posting straight to this route.
 *
 * Responses carry a written reason, never an exception's text (rule 7).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Trimmed length limits. Deliberately tighter than the tool schema advertises. */
export const LIMITS = {
  name: { min: 1, max: 40 },
  message: { min: 1, max: 280 },
} as const;

export interface ValidatedEntry {
  name: string;
  message: string;
}

export type ValidateResponse =
  | { ok: true; entry: ValidatedEntry }
  | { ok: false; reason: string };

/** C0 and C1 control characters, which have no place in a guestbook entry. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Replaces control characters with spaces, collapses runs of whitespace, trims. */
function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

export function validateGuestbookRequest(body: unknown): ValidateResponse {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "The request body must be a JSON object." };
  }

  const { action, name, message } = body as Record<string, unknown>;

  if (action !== "add_guestbook_entry") {
    return {
      ok: false,
      reason: "Unknown action. The only supported action is add_guestbook_entry.",
    };
  }

  const cleanName = clean(name);
  if (cleanName.length < LIMITS.name.min) {
    return { ok: false, reason: "A name is required." };
  }
  if (cleanName.length > LIMITS.name.max) {
    return { ok: false, reason: `The name must be ${LIMITS.name.max} characters or fewer.` };
  }

  const cleanMessage = clean(message);
  if (cleanMessage.length < LIMITS.message.min) {
    return { ok: false, reason: "A message is required." };
  }
  if (cleanMessage.length > LIMITS.message.max) {
    return { ok: false, reason: `The message must be ${LIMITS.message.max} characters or fewer.` };
  }

  return { ok: true, entry: { name: cleanName, message: cleanMessage } };
}

export async function POST(request: Request): Promise<NextResponse<ValidateResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "The request body was not valid JSON." },
      { status: 400 },
    );
  }

  const result = validateGuestbookRequest(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
