/**
 * Boundary revalidation tests (CLAUDE.md rule 8). These run against the validator
 * directly rather than through the route, because the point under test is that the
 * server does not trust the tool's inputSchema, not that Next can parse JSON.
 */

import { describe, expect, it } from "vitest";
import { LIMITS, validateGuestbookRequest } from "@/app/api/validate/route";

const ok = (over: Record<string, unknown> = {}) => ({
  action: "add_guestbook_entry",
  name: "Marguerite",
  message: "The lamp arrived warm.",
  ...over,
});

describe("validateGuestbookRequest", () => {
  it("accepts a well-formed entry", () => {
    expect(validateGuestbookRequest(ok())).toEqual({
      ok: true,
      entry: { name: "Marguerite", message: "The lamp arrived warm." },
    });
  });

  it("rejects a body that is not an object", () => {
    for (const body of ["nope", 7, null, undefined]) {
      expect(validateGuestbookRequest(body)).toMatchObject({ ok: false });
    }
  });

  it("rejects an unknown action", () => {
    expect(validateGuestbookRequest(ok({ action: "drop_table" }))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Unknown action"),
    });
  });

  it("rejects non-string fields rather than coercing them", () => {
    expect(validateGuestbookRequest(ok({ name: { toString: () => "sneaky" } }))).toMatchObject({
      ok: false,
    });
    expect(validateGuestbookRequest(ok({ message: 42 }))).toMatchObject({ ok: false });
  });

  it("rejects whitespace-only fields", () => {
    expect(validateGuestbookRequest(ok({ name: "   " }))).toMatchObject({ ok: false });
    expect(validateGuestbookRequest(ok({ message: "\t\n " }))).toMatchObject({ ok: false });
  });

  it("enforces its own length limits, not the schema's", () => {
    const longName = "x".repeat(LIMITS.name.max + 1);
    expect(validateGuestbookRequest(ok({ name: longName }))).toMatchObject({ ok: false });
    expect(validateGuestbookRequest(ok({ name: "x".repeat(LIMITS.name.max) })).ok).toBe(true);

    const longMessage = "x".repeat(LIMITS.message.max + 1);
    expect(validateGuestbookRequest(ok({ message: longMessage }))).toMatchObject({ ok: false });
    expect(validateGuestbookRequest(ok({ message: "x".repeat(LIMITS.message.max) })).ok).toBe(true);
  });

  it("strips control characters and collapses whitespace", () => {
    const result = validateGuestbookRequest(
      ok({ name: "Mar\u0000gue\u007frite", message: "  line\nbreak\u0007here  " }),
    );
    expect(result).toEqual({
      ok: true,
      entry: { name: "Mar gue rite", message: "line break here" },
    });
  });
});
