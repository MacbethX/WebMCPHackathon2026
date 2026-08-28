/**
 * The model call. Anthropic, and only Anthropic.
 *
 * This was a two-provider adapter with an OpenAI branch behind `MODEL_PROVIDER`, written
 * to the documented Responses API shape and never once executed. It is gone. Code that
 * claims to work and has never run is worse than code that is absent: absent code sends
 * you looking for an answer, untested code hands you one that may be wrong. The switch
 * existed for a competition that has ended.
 *
 * So: bring an Anthropic key. Everything on the site works without one except the
 * in-page agent and the wording helper, and the UI says which.
 *
 * The model is asked for JSON matching a schema, and is given no tools. Its job is to
 * decide; the page carries the decision out through `document.modelContext.executeTool`,
 * so the consent gate and the receipt ledger stay on the path. A model that could act
 * directly would route around both.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export interface ModelConfig {
  apiKey: string | null;
  model: string;
  /**
   * An identity-linked API key is scoped to an organization rather than a workspace, and
   * the API rejects it with a 400 unless the request names the workspace it acts in. The
   * SDK reads `ANTHROPIC_WORKSPACE_ID` for its own credential flows but does not apply it
   * to a plain API key, so it is sent as a header here. A workspace-scoped key needs
   * none of this.
   */
  workspaceId: string | null;
}

/** Changing this is a deliberate act, not a default that drifted. */
const DEFAULT_MODEL = "claude-opus-5";

export function readModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    workspaceId: env.ANTHROPIC_WORKSPACE_ID?.trim() || null,
  };
}

export interface CompletionRequest<T> {
  system: string;
  user: string;
  /** The shape the answer must take. */
  schema: z.ZodType<T>;
}

/** Raised for anything the caller handles by telling a person something. */
export class ModelError extends Error {
  constructor(
    message: string,
    /** True when an operator needs to change configuration, not retry. */
    readonly configuration = false,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

function toJsonSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  // Zod ships the conversion, so each schema is written once and both the runtime
  // validation and the wire contract come from it.
  return z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
}

function translateError(cause: unknown): ModelError {
  // Logged server-side, never returned. The operator needs the real message to fix a
  // misconfiguration; the caller must not receive upstream error text (rule 7).
  if (cause instanceof Anthropic.APIError) {
    console.error("[toolsmith] anthropic error", cause.status, cause.message);
  } else {
    console.error("[toolsmith] anthropic request failed", cause);
  }

  if (cause instanceof Anthropic.AuthenticationError) {
    return new ModelError("The Anthropic API key was rejected.", true);
  }
  if (cause instanceof Anthropic.RateLimitError) {
    return new ModelError("The model is rate limited right now. Try again shortly.");
  }
  if (cause instanceof Anthropic.APIError) {
    // One 400 is worth naming, because it is a setup problem with an exact fix rather
    // than a fault. An identity-linked key must say which workspace it acts in.
    if (cause.status === 400 && /anthropic-workspace-id/i.test(cause.message)) {
      return new ModelError(
        "This Anthropic key is identity-linked, so it needs a workspace. Either set ANTHROPIC_WORKSPACE_ID, or create a workspace-scoped key instead, which needs neither.",
        true,
      );
    }
    return new ModelError(`The model service returned an error (HTTP ${cause.status}).`);
  }
  return new ModelError("The model service could not be reached.");
}

function parseAgainst<T>(schema: z.ZodType<T>, text: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ModelError("The model returned something that was not JSON.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ModelError("The model's answer did not match the expected shape.");
  }
  return result.data;
}

/** Asks for one JSON answer, validated against the schema before it is returned. */
export async function complete<T>(
  request: CompletionRequest<T>,
  config: ModelConfig = readModelConfig(),
): Promise<T> {
  if (!config.apiKey) {
    throw new ModelError(
      "No Anthropic API key is configured on the server. Set ANTHROPIC_API_KEY.",
      true,
    );
  }

  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": config.workspaceId } }
      : {}),
  });

  let response;
  try {
    response = await client.messages.create({
      model: config.model,
      max_tokens: 4000,
      // Adaptive thinking: the model decides how much reasoning this needs. Choosing a
      // tool from a list is usually easy and occasionally is not.
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: toJsonSchema(request.schema) },
      },
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    });
  } catch (cause) {
    throw translateError(cause);
  }

  if (response.stop_reason === "refusal") {
    throw new ModelError("The model declined to answer that.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseAgainst(request.schema, text);
}
