/**
 * Guestbook mutation path, shared by both write routes into this page: the imperative
 * `add_to_guestbook` tool and the declarative `sign_guestbook` form.
 *
 * Two properties matter here (CLAUDE.md rule 8, the Gao checklist):
 *
 *   1. Every write is revalidated server-side at /api/validate before it touches local
 *      state. The tool's inputSchema is advice to the agent, not a trust boundary.
 *   2. Writes are serialized. Two agents, or an agent and a person, submitting at once
 *      queue behind each other rather than interleaving.
 */

import type { ValidateResponse, ValidatedEntry } from "../api/validate/route";

export interface GuestbookEntry extends ValidatedEntry {
  /** Local key for React. Never leaves the browser, never appears in tool output. */
  id: string;
  signedAt: number;
}

export type SubmitOutcome =
  | { status: "accepted"; entry: ValidatedEntry }
  | { status: "rejected"; reason: string }
  | { status: "ambiguous" };

/** Tail of the mutation queue. Rejections do not break the chain. */
let queue: Promise<unknown> = Promise.resolve();

/** Runs `work` after every mutation queued before it. */
export function serializeMutation<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Revalidates a guestbook entry server-side.
 *
 * A network failure after the request left the browser is genuinely ambiguous: the
 * write may or may not have been recorded. That is reported as such rather than
 * guessed at, so no caller retries a write that already landed.
 */
async function revalidate(
  name: string,
  message: string,
  signal?: AbortSignal,
): Promise<SubmitOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add_guestbook_entry", name, message }),
      signal,
    });
  } catch {
    return { status: "ambiguous" };
  }

  let payload: ValidateResponse;
  try {
    payload = (await response.json()) as ValidateResponse;
  } catch {
    return { status: "ambiguous" };
  }

  if (!payload || typeof payload !== "object" || !("ok" in payload)) {
    return { status: "ambiguous" };
  }
  return payload.ok
    ? { status: "accepted", entry: payload.entry }
    : { status: "rejected", reason: payload.reason };
}

/**
 * The one write path. Serialized, revalidated, and it appends to local state only on
 * an accepted response.
 */
export function submitGuestbookEntry(
  name: string,
  message: string,
  append: (entry: ValidatedEntry) => void,
  signal?: AbortSignal,
): Promise<SubmitOutcome> {
  return serializeMutation(async () => {
    const outcome = await revalidate(name, message, signal);
    if (outcome.status === "accepted") append(outcome.entry);
    return outcome;
  });
}
