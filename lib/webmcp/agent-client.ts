/**
 * The in-page agent's view of the page's own tools.
 *
 * WebMCP treats an author-provided agent as first class: it discovers tools with
 * `getTools()` and invokes them with `executeTool()`, and the browser mediates the call
 * so it runs in the tool owner's context. That is the surface this project is built on,
 * and this module is the only place allowed to touch it directly.
 *
 * It exists because the real API traffics in JSON strings where the published types
 * promise objects (research/raw/spike-4-executetool-string-arguments.md):
 *
 * | Surface | `webmcp-types` says | Chrome does |
 * |---|---|---|
 * | `RegisteredTool.inputSchema` | `object` | a JSON string |
 * | `executeTool(tool, args)` | object, optional | a JSON string, required |
 * | `executeTool` result | a result object | a JSON string |
 *
 * The schema one is the dangerous member of that set. Reading `.properties` off a string
 * yields `undefined` rather than throwing, so a tool with a perfectly good schema reads
 * as taking no arguments and the agent calls it with none. Every conversion happens here
 * so no call site ever sees a raw string.
 */

import { getModelContext } from "./types";
import type { CallToolResult, JsonSchemaObject } from "./types";

/** A discovered tool, with its schema already parsed. */
export interface DiscoveredTool {
  name: string;
  title: string;
  description: string;
  /** Parsed. Null when the tool declared none, or when the schema would not parse. */
  inputSchema: JsonSchemaObject | null;
  annotations: WebMCP.ToolAnnotations | null;
  /** The underlying object, needed to invoke it. */
  handle: WebMCP.RegisteredTool;
}

/**
 * Parses whatever `inputSchema` turns out to be.
 *
 * Accepts an object too, so this keeps working if Chrome starts honouring its own types.
 */
export function parseInputSchema(value: unknown): JsonSchemaObject | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null ? (parsed as JsonSchemaObject) : null;
    } catch {
      return null;
    }
  }

  return typeof value === "object" ? (value as JsonSchemaObject) : null;
}

/** Parses whatever `executeTool` resolved to, into the CallToolResult shape. */
export function parseToolResult(value: unknown): CallToolResult {
  const raw: unknown =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            // A non-JSON string is still a perfectly good answer; treat it as the text.
            return { content: [{ type: "text", text: value }] };
          }
        })()
      : value;

  if (
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as CallToolResult).content)
  ) {
    return raw as CallToolResult;
  }

  return { content: [{ type: "text", text: String(value ?? "") }] };
}

/** Every tool currently registered on this document. */
export async function discoverTools(): Promise<DiscoveredTool[]> {
  const modelContext = getModelContext();
  if (!modelContext) return [];

  const tools = await modelContext.getTools();

  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title || tool.name,
    description: tool.description,
    inputSchema: parseInputSchema(tool.inputSchema),
    annotations: tool.annotations ?? null,
    handle: tool,
  }));
}

/**
 * Invokes a tool the way the browser actually wants to be called.
 *
 * `args` goes over as a JSON string, and it is always passed: omitting it throws
 * `TypeError: 2 arguments required`.
 */
export async function invokeTool(
  tool: DiscoveredTool,
  args: Record<string, unknown> = {},
  options?: { signal?: AbortSignal },
): Promise<CallToolResult> {
  const modelContext = getModelContext();
  if (!modelContext) {
    return {
      content: [{ type: "text", text: "This browser does not support WebMCP." }],
      isError: true,
    };
  }

  try {
    const raw = await modelContext.executeTool(tool.handle, JSON.stringify(args), options);
    return parseToolResult(raw);
  } catch (cause) {
    // The browser's own failure text is generic ("the script function threw an error")
    // and says nothing useful, so it is replaced rather than passed along. The real
    // exception is in the page console; spike 5 covers why.
    const name = cause instanceof Error ? cause.name : "Error";
    return {
      content: [
        {
          type: "text",
          text:
            name === "AbortError"
              ? `The call to ${tool.name} was cancelled.`
              : `${tool.name} could not be run. The page console has the actual error.`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Subscribes to the document's tool list.
 *
 * `toolchange` fires when tools are registered or unregistered, which is how the
 * builder's list stays in step with what has been approved without anyone polling.
 */
export function subscribeToTools(listener: () => void): () => void {
  const modelContext = getModelContext();
  if (!modelContext) return () => {};

  modelContext.addEventListener("toolchange", listener);
  return () => modelContext.removeEventListener("toolchange", listener);
}

/** The first text block of a result, which is what a person or a model reads. */
export function resultText(result: CallToolResult): string {
  return result.content.find((block) => block.type === "text")?.text ?? "";
}
