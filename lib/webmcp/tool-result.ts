/**
 * CallToolResult construction (CLAUDE.md rule 7).
 *
 * Every tool result is bounded, reduced, and redacted: no internal IDs, no raw upstream
 * error text, no capability-granting URLs. Bounding happens here so no call site can
 * forget it.
 */

import { BUDGETS } from "./budgets";
import type { CallToolResult } from "./types";

const TRUNCATION_MARKER = "... [truncated]";

/** Truncates to the tool output budget, leaving room for the marker. */
export function boundText(text: string): string {
  if (text.length <= BUDGETS.toolOutput) return text;
  return text.slice(0, BUDGETS.toolOutput - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

/** A successful result. */
export function toolText(text: string): CallToolResult {
  return { content: [{ type: "text", text: boundText(text) }] };
}

/**
 * A failed result. The message must already be safe to show an agent: callers pass a
 * sentence they wrote, never an exception's own text.
 */
export function toolError(text: string): CallToolResult {
  return { content: [{ type: "text", text: boundText(text) }], isError: true };
}

/**
 * A mutation whose outcome could not be determined. Reported as unsafe to retry rather
 * than guessed at (CLAUDE.md rule 8, the Gao checklist).
 */
export function toolAmbiguous(action: string): CallToolResult {
  return toolError(
    `The outcome of "${action}" could not be confirmed. It is unsafe to retry: it may already have taken effect. Ask the person to check the page before trying again.`,
  );
}
