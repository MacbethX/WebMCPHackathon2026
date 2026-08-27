/**
 * Registration lifecycle tests (CLAUDE.md rule 4 and the Gao checklist in
 * research/raw/vercel-shop-saga.md, which calls for a mount / abort / remount smoke
 * test showing no duplicates).
 */

import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ToolRegistration,
  ToolRegistrations,
  useToolRegistration,
} from "@/lib/webmcp/registration-manager";
import { toolText } from "@/lib/webmcp/tool-result";
import { installFakeModelContext, removeModelContext } from "./model-context-fake";
import type { ToolSpec } from "@/lib/webmcp/types";

function makeSpec(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: "test_tool",
    description: "A tool that exists only to be registered and unregistered.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { readOnlyHint: true },
    execute: () => toolText("ok"),
    ...overrides,
  };
}

afterEach(() => {
  removeModelContext();
  vi.restoreAllMocks();
});

describe("mount, abort, remount", () => {
  it("registers the tool on mount", async () => {
    const context = installFakeModelContext();
    render(<ToolRegistration spec={makeSpec()} />);

    await waitFor(() => expect(context.live()).toHaveLength(1));
    expect(context.live()[0].tool.name).toBe("test_tool");
    expect(context.live()[0].tool.annotations).toEqual({ readOnlyHint: true });
  });

  it("aborts the registration on unmount, leaving nothing live", async () => {
    const context = installFakeModelContext();
    const view = render(<ToolRegistration spec={makeSpec()} />);
    await waitFor(() => expect(context.live()).toHaveLength(1));

    view.unmount();

    expect(context.live()).toHaveLength(0);
    expect(context.all[0].signal?.aborted).toBe(true);
  });

  it("remounts without leaving a duplicate behind", async () => {
    const context = installFakeModelContext();

    const first = render(<ToolRegistration spec={makeSpec()} />);
    await waitFor(() => expect(context.live()).toHaveLength(1));
    first.unmount();

    const second = render(<ToolRegistration spec={makeSpec()} />);
    await waitFor(() => expect(context.live()).toHaveLength(1));

    expect(context.all).toHaveLength(2);
    expect(context.live()).toHaveLength(1);
    second.unmount();
    expect(context.live()).toHaveLength(0);
  });

  it("survives StrictMode's double mount with exactly one live registration", async () => {
    const context = installFakeModelContext();

    render(
      <StrictMode>
        <ToolRegistration spec={makeSpec()} />
      </StrictMode>,
    );

    await waitFor(() => expect(context.live()).toHaveLength(1));
  });

  it("registers every tool in a set, and aborts every one on unmount", async () => {
    const context = installFakeModelContext();
    const specs = [
      makeSpec({ name: "tool_one" }),
      makeSpec({ name: "tool_two" }),
      makeSpec({ name: "tool_three" }),
    ];

    const view = render(<ToolRegistrations specs={specs} />);
    await waitFor(() => expect(context.live()).toHaveLength(3));
    expect(context.live().map((r) => r.tool.name).sort()).toEqual([
      "tool_one",
      "tool_three",
      "tool_two",
    ]);

    view.unmount();
    expect(context.live()).toHaveLength(0);
  });

  it("aborts a registration that resolves after unmount", async () => {
    const context = installFakeModelContext();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    context.registerTool.mockImplementationOnce(
      async (tool: WebMCP.ModelContextTool, options?: { signal?: AbortSignal }) => {
        await gate;
        const record = { tool, signal: options?.signal, aborted: options?.signal?.aborted ?? false };
        options?.signal?.addEventListener("abort", () => {
          record.aborted = true;
        });
        context.all.push(record);
      },
    );

    const view = render(<ToolRegistration spec={makeSpec()} />);
    view.unmount();
    release();

    await waitFor(() => expect(context.all).toHaveLength(1));
    expect(context.live()).toHaveLength(0);
  });
});

describe("what the browser actually passes", () => {
  it("still runs when the browser calls execute with no options argument", async () => {
    const context = installFakeModelContext();
    const seen: Array<{ signal: AbortSignal }> = [];
    render(
      <ToolRegistration
        spec={makeSpec({
          execute: (_args, options) => {
            seen.push(options);
            return toolText("ok");
          },
        })}
      />,
    );
    await waitFor(() => expect(context.live()).toHaveLength(1));

    // Chrome invokes execute(input) with a single argument. webmcp-types says otherwise.
    const registered = context.live()[0].tool as unknown as {
      execute: (args: Record<string, unknown>) => unknown;
    };
    const result = await registered.execute({});

    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    expect(seen[0].signal.aborted).toBe(false);
  });
});

describe("re-registration identity", () => {
  it("does not re-register when only execute changes", async () => {
    const context = installFakeModelContext();
    const view = render(<ToolRegistration spec={makeSpec({ execute: () => toolText("a") })} />);
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(1));

    view.rerender(<ToolRegistration spec={makeSpec({ execute: () => toolText("b") })} />);
    await waitFor(() => expect(context.live()).toHaveLength(1));

    expect(context.registerTool).toHaveBeenCalledTimes(1);
  });

  it("routes calls to the latest execute without re-registering", async () => {
    const context = installFakeModelContext();
    const view = render(<ToolRegistration spec={makeSpec({ execute: () => toolText("first") })} />);
    await waitFor(() => expect(context.live()).toHaveLength(1));

    view.rerender(<ToolRegistration spec={makeSpec({ execute: () => toolText("second") })} />);

    const registered = context.live()[0].tool;
    const result = await registered.execute({}, { signal: new AbortController().signal });
    expect(result).toEqual({ content: [{ type: "text", text: "second" }] });
    expect(context.registerTool).toHaveBeenCalledTimes(1);
  });

  it("re-registers when the declaration changes, with no duplicate", async () => {
    const context = installFakeModelContext();
    const view = render(<ToolRegistration spec={makeSpec()} />);
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(1));

    view.rerender(<ToolRegistration spec={makeSpec({ description: "A different description." })} />);
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(2));

    expect(context.live()).toHaveLength(1);
    expect(context.live()[0].tool.description).toBe("A different description.");
  });
});

describe("degradation and refusal", () => {
  it("is inert and reports unsupported without document.modelContext", () => {
    removeModelContext();
    const seen: Array<{ supported: boolean; registered: boolean }> = [];

    function Probe() {
      const status = useToolRegistration(makeSpec());
      seen.push({ supported: status.supported, registered: status.registered });
      return null;
    }

    expect(() => render(<Probe />)).not.toThrow();
    expect(seen[0]).toEqual({ supported: false, registered: false });
  });

  it("refuses to register a tool that busts a character budget", async () => {
    const context = installFakeModelContext();
    const errors: Array<Error | null> = [];

    function Probe() {
      const status = useToolRegistration(makeSpec({ name: "x".repeat(31) }));
      errors.push(status.error);
      return null;
    }

    render(<Probe />);

    await waitFor(() => expect(errors.at(-1)).toBeInstanceOf(Error));
    expect(errors.at(-1)?.message).toContain("toolName budget of 30");
    expect(context.registerTool).not.toHaveBeenCalled();
  });

  it("surfaces a registration rejection without throwing", async () => {
    const context = installFakeModelContext();
    context.registerTool.mockRejectedValueOnce(
      Object.assign(new Error("tools policy"), { name: "NotAllowedError" }),
    );
    const errors: Array<Error | null> = [];

    function Probe() {
      const status = useToolRegistration(makeSpec());
      errors.push(status.error);
      return null;
    }

    render(<Probe />);

    await waitFor(() => expect(errors.at(-1)?.message).toBe("tools policy"));
  });
});
