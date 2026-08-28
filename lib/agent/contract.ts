/**
 * The contract between the page and the model proxy.
 *
 * Two jobs, and neither of them is "run the tool". The model returns a decision; the
 * page carries it out through `document.modelContext.executeTool`, which means every
 * call still passes the consent gate and still lands in the ledger. A model that could
 * act directly would route around both, and the trust layer is the point of the project.
 *
 * Shared by the route handler and its callers, so the wire format has one definition.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Refining a proposal
// ---------------------------------------------------------------------------

/**
 * Improving the prose on a generated proposal.
 *
 * The model rewrites descriptions. It does not invent parameters, rename them, or
 * decide anything about consent: the analyzer owns the shape and the human owns the
 * consent decision, so the response schema simply has nowhere to put those.
 */
export const RefineRequestSchema = z.object({
  kind: z.literal("refine"),
  toolName: z.string().max(30),
  /** The draft, for the model to improve rather than replace. */
  draftDescription: z.string().max(2000),
  /** Whether the tool changes anything, so the description can say so plainly. */
  mutating: z.boolean(),
  /** The surrounding page text, which is where the site's own vocabulary lives. */
  context: z.string().max(8000).optional(),
  params: z
    .array(
      z.object({
        name: z.string().max(30),
        draftDescription: z.string().max(600),
        type: z.string().max(40),
        required: z.boolean(),
        /** Constraints in words, since the model writes prose, not schema. */
        constraints: z.string().max(300).optional(),
      }),
    )
    .max(40),
});

export const RefineResponseSchema = z.object({
  description: z.string(),
  params: z.array(z.object({ name: z.string(), description: z.string() })),
});

export type RefineRequest = z.infer<typeof RefineRequestSchema>;
export type RefineResponse = z.infer<typeof RefineResponseSchema>;

// ---------------------------------------------------------------------------
// Choosing a tool to call
// ---------------------------------------------------------------------------

/** One tool as the model sees it. Schemas arrive already parsed (spike 4). */
export const OfferedToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.unknown().nullable(),
  readOnly: z.boolean(),
});

export const ActRequestSchema = z.object({
  kind: z.literal("act"),
  /** What the person asked for, in their words. */
  request: z.string().max(2000),
  tools: z.array(OfferedToolSchema).max(50),
});

/**
 * The model's answer: one tool and its arguments, or a refusal to pick.
 *
 * `arguments` is a JSON string rather than an object. Models are more reliable emitting
 * one string than an object whose shape changes per tool, and the page has to stringify
 * it for `executeTool` anyway.
 */
export const ActResponseSchema = z.object({
  /** Null when no offered tool fits. Saying so is a valid answer. */
  toolName: z.string().nullable(),
  argumentsJson: z.string(),
  /** One sentence, shown to the person before anything is invoked. */
  reasoning: z.string(),
});

export type OfferedTool = z.infer<typeof OfferedToolSchema>;
export type ActRequest = z.infer<typeof ActRequestSchema>;
export type ActResponse = z.infer<typeof ActResponseSchema>;

export const AgentRequestSchema = z.discriminatedUnion("kind", [
  RefineRequestSchema,
  ActRequestSchema,
]);

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

/** What the route returns when it cannot answer. Never carries upstream error text. */
export interface AgentError {
  ok: false;
  reason: string;
  /** True when the operator needs to do something, e.g. set a key. */
  configuration?: boolean;
}

export type AgentResult<T> = { ok: true; data: T } | AgentError;
