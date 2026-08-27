/**
 * The sandbox's imperative tools. Two of the three tools on this page live here; the
 * third, `sign_guestbook`, is synthesized by the browser from the declarative
 * attributes on the guestbook form (see storefront.tsx).
 *
 * Routing follows the rule derived in research/raw/spike-2-chrome-declarative-synthesis.md:
 * declarative for form-shaped actions, imperative for everything else and wherever
 * hints or strict validation matter. Declarative tools cannot carry annotations at all,
 * which is why the read-only catalog tool is imperative.
 */

import { PRODUCTS } from "./catalog";
import { submitGuestbookEntry } from "./guestbook";
import { toolAmbiguous, toolError, toolText } from "@/lib/webmcp/tool-result";
import type { ValidatedEntry } from "../api/validate/route";
import type { ToolSpec } from "@/lib/webmcp/types";

const money = (usd: number) => `$${usd}`;

/**
 * Reads the catalog. Non-mutating, so `readOnlyHint` is set and an agent can skip its
 * confirmation step (CLAUDE.md rule 6).
 *
 * Output carries names, prices, and blurbs. Not product IDs: an internal key is of no
 * use to an agent and is exactly the kind of detail rule 7 keeps out of tool output.
 */
export const listProductsTool: ToolSpec<{ max_price?: number }> = {
  name: "list_products",
  title: "List products",
  description:
    "Lists everything for sale in this shop, with prices in US dollars. Optionally filters to items at or below a price. Read-only: it never changes anything.",
  inputSchema: {
    type: "object",
    properties: {
      max_price: {
        type: "number",
        description: "Only list items at or below this price, in US dollars.",
        minimum: 0,
      },
    },
    required: [],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: ({ max_price: maxPrice }) => {
    const ceiling = typeof maxPrice === "number" && Number.isFinite(maxPrice) ? maxPrice : null;
    const matches = ceiling === null ? PRODUCTS : PRODUCTS.filter((p) => p.priceUsd <= ceiling);

    if (matches.length === 0) {
      return toolText(`Nothing in the shop is ${money(ceiling ?? 0)} or less.`);
    }

    const lines = matches.map((p) => `${p.name} (${money(p.priceUsd)}): ${p.blurb}`);
    const header =
      ceiling === null
        ? `${matches.length} items for sale:`
        : `${matches.length} of ${PRODUCTS.length} items are ${money(ceiling)} or less:`;
    return toolText([header, ...lines].join("\n"));
  },
};

/**
 * Writes a guestbook entry. Mutating, so no `readOnlyHint`. The result echoes the
 * visitor's own text, which is user-supplied content, so `untrustedContentHint` is set
 * (rule 6).
 *
 * Arguments are revalidated server-side before anything is written, and concurrent
 * writes are serialized (rule 8). Both are handled by `submitGuestbookEntry`.
 */
export function createAddToGuestbookTool(
  append: (entry: ValidatedEntry) => void,
): ToolSpec<{ name: string; message: string }> {
  return {
    name: "add_to_guestbook",
    title: "Sign the guestbook",
    description:
      "Signs the shop's guestbook with a short public message. This changes the page: the entry appears immediately and is visible to everyone who visits. Ask the person before calling it.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Who is signing. 1 to 40 characters.",
          minLength: 1,
          maxLength: 40,
        },
        message: {
          type: "string",
          description: "The message to leave. 1 to 280 characters.",
          minLength: 1,
          maxLength: 280,
        },
      },
      required: ["name", "message"],
      additionalProperties: false,
    },
    annotations: { untrustedContentHint: true },
    execute: async ({ name, message }, { signal }) => {
      const outcome = await submitGuestbookEntry(String(name ?? ""), String(message ?? ""), append, signal);

      switch (outcome.status) {
        case "accepted":
          return toolText(`Signed the guestbook as ${outcome.entry.name}.`);
        case "rejected":
          return toolError(`The guestbook did not accept that entry. ${outcome.reason}`);
        case "ambiguous":
          return toolAmbiguous("signing the guestbook");
      }
    },
  };
}
