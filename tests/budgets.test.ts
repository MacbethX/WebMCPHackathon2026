/**
 * Budget linter tests (CLAUDE.md rule 5). Every budget is checked at its exact limit
 * and one character past it, because off-by-one is the only interesting failure a
 * length check has.
 */

import { describe, expect, it } from "vitest";
import { BUDGETS, formatViolations, lintToolSpec } from "@/lib/webmcp/budgets";
import { boundText, toolAmbiguous, toolError, toolText } from "@/lib/webmcp/tool-result";
import { createAddToGuestbookTool, listProductsTool } from "@/app/sandbox/tools";
import type { ToolSpec } from "@/lib/webmcp/types";

const base: ToolSpec = {
  name: "ok_tool",
  description: "Fine.",
  inputSchema: { type: "object", properties: {}, required: [] },
  execute: () => toolText("ok"),
};

const fill = (n: number) => "x".repeat(n);

describe("lintToolSpec", () => {
  it("passes a tool that sits exactly on every limit", () => {
    const spec: ToolSpec = {
      ...base,
      name: fill(BUDGETS.toolName),
      description: fill(BUDGETS.toolDescription),
      inputSchema: {
        type: "object",
        properties: {
          [fill(BUDGETS.paramName)]: {
            type: "string",
            description: fill(BUDGETS.paramDescription),
          },
        },
        required: [],
      },
    };
    expect(lintToolSpec(spec)).toEqual([]);
  });

  it("flags a tool name one character over", () => {
    const violations = lintToolSpec({ ...base, name: fill(BUDGETS.toolName + 1) });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ budget: "toolName", limit: 30, actual: 31 });
  });

  it("flags a tool description one character over", () => {
    const violations = lintToolSpec({
      ...base,
      description: fill(BUDGETS.toolDescription + 1),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].budget).toBe("toolDescription");
  });

  it("flags a parameter name one character over", () => {
    const violations = lintToolSpec({
      ...base,
      inputSchema: {
        type: "object",
        properties: { [fill(BUDGETS.paramName + 1)]: { type: "string" } },
        required: [],
      },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].budget).toBe("paramName");
  });

  it("flags a parameter description one character over", () => {
    const violations = lintToolSpec({
      ...base,
      inputSchema: {
        type: "object",
        properties: {
          note: { type: "string", description: fill(BUDGETS.paramDescription + 1) },
        },
        required: [],
      },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      budget: "paramDescription",
      path: "ok_tool.note.description",
    });
  });

  it("reports every violation at once, not just the first", () => {
    const violations = lintToolSpec({
      ...base,
      name: fill(BUDGETS.toolName + 1),
      description: fill(BUDGETS.toolDescription + 1),
    });
    expect(violations).toHaveLength(2);
    expect(formatViolations(violations)).toContain("exceeds the toolName budget of 30");
  });
});

describe("this repo's own tools obey the budgets", () => {
  it.each([
    ["list_products", listProductsTool],
    ["add_to_guestbook", createAddToGuestbookTool(() => {})],
  ])("%s", (_name, spec) => {
    expect(lintToolSpec(spec as ToolSpec)).toEqual([]);
  });
});

describe("output bounding", () => {
  it("leaves output at the limit untouched", () => {
    const text = fill(BUDGETS.toolOutput);
    expect(boundText(text)).toBe(text);
    expect(toolText(text).content[0].text).toHaveLength(BUDGETS.toolOutput);
  });

  it("truncates output one character over, marking it", () => {
    const bounded = boundText(fill(BUDGETS.toolOutput + 1));
    expect(bounded).toHaveLength(BUDGETS.toolOutput);
    expect(bounded.endsWith("... [truncated]")).toBe(true);
  });

  it("bounds error results too", () => {
    const result = toolError(fill(BUDGETS.toolOutput + 500));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toHaveLength(BUDGETS.toolOutput);
  });

  it("reports an ambiguous mutation as unsafe to retry", () => {
    const result = toolAmbiguous("signing the guestbook");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unsafe to retry");
  });
});
