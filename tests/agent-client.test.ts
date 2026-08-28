/**
 * Agent client tests.
 *
 * Mostly about spike 4: the API hands back JSON strings where the published types
 * promise objects. The schema case is the one that matters, because reading
 * `.properties` off a string yields undefined rather than throwing, so a tool with a
 * good schema silently reads as taking no arguments.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverTools,
  invokeTool,
  parseInputSchema,
  parseToolResult,
  resultText,
  subscribeToTools,
} from "@/lib/webmcp/agent-client";
import { removeModelContext } from "./model-context-fake";

const SCHEMA = {
  type: "object",
  properties: { name: { type: "string", description: "Who." } },
  required: ["name"],
};

/** A model context that behaves the way Chrome actually behaves. */
function installChromeLikeContext(overrides: Partial<Record<string, unknown>> = {}) {
  const executeTool = vi.fn(async (_tool: unknown, args: unknown) => {
    // Chrome rejects an object here. Reproduce that, so a regression is caught.
    if (typeof args !== "string") throw Object.assign(new Error("bad args"), { name: "UnknownError" });
    return JSON.stringify({ content: [{ type: "text", text: `ran with ${args}` }] });
  });

  const context = Object.assign(new EventTarget(), {
    getTools: vi.fn(async () => [
      {
        name: "sign_guestbook",
        title: "Sign the guestbook",
        description: "Signs it.",
        // A JSON string, as Chrome returns it.
        inputSchema: JSON.stringify(SCHEMA),
        annotations: { readOnlyHint: false, untrustedContentHint: true },
      },
    ]),
    executeTool,
    registerTool: vi.fn(),
    ontoolchange: null,
    ...overrides,
  });

  Object.defineProperty(document, "modelContext", {
    configurable: true,
    writable: true,
    value: context,
  });
  return context;
}

afterEach(() => {
  removeModelContext();
  vi.restoreAllMocks();
});

describe("parseInputSchema", () => {
  it("parses the JSON string Chrome actually returns", () => {
    expect(parseInputSchema(JSON.stringify(SCHEMA))).toEqual(SCHEMA);
  });

  it("passes an object through, for when Chrome honours its own types", () => {
    expect(parseInputSchema(SCHEMA)).toEqual(SCHEMA);
  });

  it("returns null rather than a half-parsed object on malformed input", () => {
    expect(parseInputSchema("{not json")).toBeNull();
    expect(parseInputSchema(undefined)).toBeNull();
    expect(parseInputSchema(null)).toBeNull();
    expect(parseInputSchema('"a string"')).toBeNull();
  });
});

describe("parseToolResult", () => {
  it("parses the JSON string Chrome returns", () => {
    const raw = JSON.stringify({ content: [{ type: "text", text: "done" }] });
    expect(parseToolResult(raw)).toEqual({ content: [{ type: "text", text: "done" }] });
  });

  it("preserves isError", () => {
    const raw = JSON.stringify({ content: [{ type: "text", text: "no" }], isError: true });
    expect(parseToolResult(raw).isError).toBe(true);
  });

  it("treats a non-JSON string as the text itself rather than losing it", () => {
    expect(parseToolResult("just words")).toEqual({
      content: [{ type: "text", text: "just words" }],
    });
  });

  it("passes a real object through", () => {
    const result = { content: [{ type: "text" as const, text: "x" }] };
    expect(parseToolResult(result)).toEqual(result);
  });
});

describe("discoverTools", () => {
  it("returns tools with their schemas already parsed", async () => {
    installChromeLikeContext();

    const [tool] = await discoverTools();

    expect(tool.name).toBe("sign_guestbook");
    expect(tool.inputSchema).toEqual(SCHEMA);
    // The bug this module exists to prevent: a schema that reads as no parameters.
    expect(Object.keys(tool.inputSchema!.properties!)).toEqual(["name"]);
    expect(tool.annotations?.untrustedContentHint).toBe(true);
  });

  it("returns nothing, rather than throwing, without WebMCP", async () => {
    removeModelContext();
    await expect(discoverTools()).resolves.toEqual([]);
  });
});

describe("invokeTool", () => {
  it("sends arguments as a JSON string, which is what the browser accepts", async () => {
    const context = installChromeLikeContext();
    const [tool] = await discoverTools();

    const result = await invokeTool(tool, { name: "Otto" });

    expect(context.executeTool).toHaveBeenCalledWith(
      tool.handle,
      JSON.stringify({ name: "Otto" }),
      undefined,
    );
    expect(resultText(result)).toContain('{"name":"Otto"}');
  });

  it("always passes an arguments string, because omitting it is a TypeError", async () => {
    const context = installChromeLikeContext();
    const [tool] = await discoverTools();

    await invokeTool(tool);

    expect(context.executeTool).toHaveBeenCalledWith(tool.handle, "{}", undefined);
  });

  it("reports a failure as an error result rather than throwing at the caller", async () => {
    installChromeLikeContext({
      executeTool: vi.fn(async () => {
        throw Object.assign(new Error("the script function threw an error"), {
          name: "UnknownError",
        });
      }),
    });
    const [tool] = await discoverTools();

    const result = await invokeTool(tool, { name: "Otto" });

    expect(result.isError).toBe(true);
    // The browser's own message says nothing; ours points at where the truth is.
    expect(resultText(result)).toContain("page console");
  });

  it("names a cancellation as a cancellation", async () => {
    installChromeLikeContext({
      executeTool: vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }),
    });
    const [tool] = await discoverTools();

    expect(resultText(await invokeTool(tool))).toContain("cancelled");
  });
});

describe("subscribeToTools", () => {
  it("fires on toolchange and stops after unsubscribing", async () => {
    const context = installChromeLikeContext();
    const listener = vi.fn();

    const unsubscribe = subscribeToTools(listener);
    context.dispatchEvent(new Event("toolchange"));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    context.dispatchEvent(new Event("toolchange"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without WebMCP", () => {
    removeModelContext();
    expect(() => subscribeToTools(vi.fn())()).not.toThrow();
  });
});
