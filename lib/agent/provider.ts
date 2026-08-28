/**
 * The model adapter (CLAUDE.md, "Model provider").
 *
 * One env var switches: `MODEL_PROVIDER=anthropic|openai`, with `ANTHROPIC_API_KEY` or
 * `OPENAI_API_KEY` alongside it. Keys are read here, on the server, and never reach the
 * client.
 *
 * Both providers are asked for the same thing: JSON matching a schema. Neither is given
 * tools, because the model's job is to decide, not to act. The page carries out the
 * decision through `executeTool`, so the consent gate and the ledger stay on the path.
 *
 * Status: the Anthropic adapter is the one this project runs on and the one that has
 * been exercised. The OpenAI adapter is written to the documented Responses API shape
 * and is unverified; CLAUDE.md calls for the switch to exist, so it exists, but do not
 * assume it works until someone has run it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type ProviderName = "anthropic" | "openai";

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string | null;
  model: string;
}

/** Claude Opus 5. Changing this is a deliberate act, not a default that drifted. */
const ANTHROPIC_MODEL = "claude-opus-5";
const OPENAI_MODEL = "gpt-5.6";

export function readProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const provider: ProviderName = env.MODEL_PROVIDER === "openai" ? "openai" : "anthropic";

  return provider === "openai"
    ? { provider, apiKey: env.OPENAI_API_KEY?.trim() || null, model: env.OPENAI_MODEL?.trim() || OPENAI_MODEL }
    : { provider, apiKey: env.ANTHROPIC_API_KEY?.trim() || null, model: env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_MODEL };
}

export interface CompletionRequest<T> {
  system: string;
  user: string;
  /** The shape the answer must take. */
  schema: z.ZodType<T>;
  /** A name for the schema, which both providers want. */
  schemaName: string;
}

/** Raised for anything the caller is expected to handle by telling a person something. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly configuration = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function toJsonSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  // Zod 4 ships JSON Schema conversion, so each schema is written once and both the
  // runtime validation and the wire contract are derived from it.
  return z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
}

async function completeWithAnthropic<T>(
  config: ProviderConfig,
  request: CompletionRequest<T>,
): Promise<T> {
  const client = new Anthropic({ apiKey: config.apiKey ?? undefined });

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
        // Anthropic's JSONOutputFormat takes only a type and a schema. The schema name
        // is an OpenAI requirement, so it is carried in the request but not sent here.
        format: {
          type: "json_schema",
          schema: toJsonSchema(request.schema),
        },
      },
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    });
  } catch (cause) {
    throw translateAnthropicError(cause);
  }

  if (response.stop_reason === "refusal") {
    throw new ProviderError("The model declined to answer that.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseAgainst(request.schema, text);
}

function translateAnthropicError(cause: unknown): ProviderError {
  if (cause instanceof Anthropic.AuthenticationError) {
    return new ProviderError("The Anthropic API key was rejected.", true);
  }
  if (cause instanceof Anthropic.RateLimitError) {
    return new ProviderError("The model is rate limited right now. Try again shortly.");
  }
  if (cause instanceof Anthropic.APIError) {
    // The upstream message is not passed on: rule 7 keeps raw upstream error text out
    // of anything a caller sees, and it routinely carries request details.
    return new ProviderError(`The model service returned an error (HTTP ${cause.status}).`);
  }
  return new ProviderError("The model service could not be reached.");
}

/**
 * OpenAI Responses API. Written to the documented shape, never exercised.
 */
async function completeWithOpenAI<T>(
  config: ProviderConfig,
  request: CompletionRequest<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        instructions: request.system,
        input: request.user,
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: toJsonSchema(request.schema),
          },
        },
      }),
    });
  } catch {
    throw new ProviderError("The model service could not be reached.");
  }

  if (response.status === 401) throw new ProviderError("The OpenAI API key was rejected.", true);
  if (response.status === 429) {
    throw new ProviderError("The model is rate limited right now. Try again shortly.");
  }
  if (!response.ok) {
    throw new ProviderError(`The model service returned an error (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const text =
    payload.output_text ??
    payload.output?.flatMap((item) => item.content ?? []).map((block) => block.text ?? "").join("") ??
    "";

  return parseAgainst(request.schema, text);
}

function parseAgainst<T>(schema: z.ZodType<T>, text: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProviderError("The model returned something that was not JSON.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderError("The model's answer did not match the expected shape.");
  }
  return result.data;
}

/** Asks the configured provider for one JSON answer. */
export async function complete<T>(
  request: CompletionRequest<T>,
  config: ProviderConfig = readProviderConfig(),
): Promise<T> {
  if (!config.apiKey) {
    throw new ProviderError(
      config.provider === "anthropic"
        ? "No Anthropic API key is configured on the server. Set ANTHROPIC_API_KEY."
        : "No OpenAI API key is configured on the server. Set OPENAI_API_KEY.",
      true,
    );
  }

  return config.provider === "openai"
    ? completeWithOpenAI(config, request)
    : completeWithAnthropic(config, request);
}
