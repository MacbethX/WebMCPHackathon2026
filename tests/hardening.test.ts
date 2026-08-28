/**
 * Hostile and degenerate input.
 *
 * The sanitizer's own tests cover markup that is trying to do something. These cover
 * markup that is merely broken, empty, enormous, or repetitive: the cases that turn into
 * a hung tab or a tool nobody can address, rather than into an exploit.
 */

import { describe, expect, it } from "vitest";
import { INPUT_LIMITS, checkInput, deduplicateNames, generate } from "@/lib/generator/generate";
import { BUDGETS } from "@/lib/webmcp/budgets";
import { sanitizeHtml } from "@/lib/generator/sanitize";

describe("input limits", () => {
  it("refuses empty and whitespace-only input with something to do about it", () => {
    expect(checkInput("")).toContain("Paste");
    expect(checkInput("   \n  ")).toContain("Paste");
  });

  it("accepts ordinary input", () => {
    expect(checkInput("<form><input name=a></form>")).toBeNull();
  });

  it("refuses input past the character cap, and says what to do instead", () => {
    const huge = "x".repeat(INPUT_LIMITS.maxCharacters + 1);
    const refusal = checkInput(huge);

    expect(refusal).not.toBeNull();
    expect(refusal).toContain("Paste the part of the page");
  });

  it("processes at most maxForms, rather than however many were pasted", () => {
    const many = Array.from(
      { length: INPUT_LIMITS.maxForms + 10 },
      (_unused, index) => `<form id="f${index}" method="post"><input name="a"></form>`,
    ).join("");

    expect(generate(many)).toHaveLength(INPUT_LIMITS.maxForms);
  });
});

describe("name collisions", () => {
  it("numbers duplicates instead of registering two tools under one name", () => {
    expect(deduplicateNames(["sign_up", "sign_up", "sign_up"])).toEqual([
      "sign_up",
      "sign_up_2",
      "sign_up_3",
    ]);
  });

  it("leaves distinct names alone", () => {
    expect(deduplicateNames(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("keeps a numbered name inside the budget", () => {
    const long = "x".repeat(BUDGETS.toolName);
    const [, second] = deduplicateNames([long, long]);

    expect(second.length).toBeLessThanOrEqual(BUDGETS.toolName);
    expect(second.endsWith("_2")).toBe(true);
  });

  it("gives two forms with the same submit label two addressable tools", () => {
    // Both a newsletter box and a waitlist say "Sign up". This is the common case, not
    // a contrived one.
    const names = generate(
      '<h2>Newsletter</h2><form id="a" method="post"><input name="email" required><button type="submit">Sign up</button></form>' +
        '<h2>Waitlist</h2><form id="b" method="post"><input name="email" required><button type="submit">Sign up</button></form>',
    ).map((entry) => entry.proposal.name);

    expect(names).toEqual(["sign_up", "sign_up_2"]);
    expect(new Set(names).size).toBe(2);
  });
});

describe("degenerate forms", () => {
  it("handles a form with nothing fillable, and says so", () => {
    const [generated] = generate('<form id="x" method="post"><button type="submit">Go</button></form>');

    expect(generated.proposal.params).toHaveLength(0);
    expect(generated.proposal.warnings.join(" ")).toContain("no fillable controls");
    expect(generated.imperative?.code).toContain("No fillable controls");
    expect(generated.violations).toEqual([]);
  });

  it("falls back to a usable name when the label slugifies to nothing", () => {
    const [generated] = generate(
      '<form id="y" method="post"><input name="a"><button type="submit">!!! ???</button></form>',
    );

    expect(generated.proposal.name).toBe("submit_form");
    expect(generated.violations).toEqual([]);
  });

  it("truncates an absurd label into the budget rather than emitting nothing", () => {
    const [generated] = generate(
      `<form id="z" method="post"><input name="a"><button type="submit">${"Book ".repeat(40)}</button></form>`,
    );

    expect(generated.proposal.name.length).toBeLessThanOrEqual(BUDGETS.toolName);
    expect(generated.violations).toEqual([]);
  });

  it("returns nothing, and does not throw, for markup with no forms", () => {
    expect(generate("<p>Just prose.</p>")).toEqual([]);
    expect(generate("")).toEqual([]);
  });

  it("survives markup that is simply broken", () => {
    expect(() =>
      generate('<form id="a"><div><input name="x" ><form><input name="y"></form></div>'),
    ).not.toThrow();
  });

  it("survives deeply nested markup without blowing the stack", () => {
    const depth = 500;
    const nested = "<div>".repeat(depth) + '<form id="deep" method="post"><input name="a"></form>' + "</div>".repeat(depth);

    expect(() => sanitizeHtml(nested)).not.toThrow();
    expect(generate(nested)).toHaveLength(1);
  });

  it("handles a control whose name would collide with an Object prototype key", () => {
    // `constructor` and `__proto__` as field names are the classic way to turn a
    // property write into something else entirely.
    const [generated] = generate(
      '<form id="p" method="post"><input name="constructor"><input name="__proto__"><button type="submit">Go</button></form>',
    );

    const properties = generated.imperative!.schema.properties!;
    expect(Object.keys(properties).sort()).toEqual(["__proto__", "constructor"].sort());
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
