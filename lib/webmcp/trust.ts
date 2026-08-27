/**
 * The trust layer: consent gate plus receipt ledger, composed (CLAUDE.md rules 9, 10).
 *
 * `withTrust` is what the app wraps its tools in. It exists rather than nesting
 * `withConsent` inside a ledger wrapper because the receipt has to record *which* way
 * consent went, and a gate that only returns a result has thrown that away by the time
 * the ledger sees it.
 *
 * The flow, for one call:
 *
 *   read-only      execute, then append a receipt marked not-required
 *   mutating       ask, and append a receipt either way: approved and executed, or
 *                  refused and untouched. A refusal is a fact worth recording.
 */

import { bypassesConsent, consentRefusalResult, requestConsent } from "./consent-gate";
import { appendReceipt } from "./receipt-ledger";
import type { ConsentStatus } from "./receipt-ledger";
import type { CallToolResult, ToolSpec } from "./types";

/** The first text block of a result, which is what a person reads in the ledger. */
export function summarize(result: CallToolResult): string {
  const text = result.content.find((block) => block.type === "text")?.text ?? "";
  const summary = text.replace(/\s+/g, " ").trim();
  if (!summary) return result.isError ? "Failed, with no message." : "Done, with no message.";
  return result.isError ? `Failed: ${summary}` : summary;
}

/** Wraps a tool so every call is gated where it should be, and recorded either way. */
export function withTrust<TArgs extends Record<string, unknown>>(
  spec: ToolSpec<TArgs>,
): ToolSpec<TArgs> {
  return {
    ...spec,
    async execute(args, options): Promise<CallToolResult> {
      let consent: ConsentStatus = "not-required";

      if (!bypassesConsent(spec)) {
        const decision = await requestConsent(
          {
            toolName: spec.name,
            title: spec.title ?? spec.name,
            description: spec.description,
            args,
          },
          options.signal,
        );
        consent = decision;

        if (decision !== "approved") {
          const refusal = consentRefusalResult(decision);
          await appendReceipt({
            tool: spec.name,
            args,
            resultSummary: summarize(refusal),
            consent,
          });
          return refusal;
        }
      }

      const result = await spec.execute(args, options);
      await appendReceipt({
        tool: spec.name,
        args,
        resultSummary: summarize(result),
        consent,
      });
      return result;
    },
  };
}
