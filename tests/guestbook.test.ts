/**
 * Mutation path tests (CLAUDE.md rule 8): revalidated at the boundary, serialized
 * against each other, and honest when the outcome is unknowable.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { submitGuestbookEntry } from "@/app/sandbox/guestbook";
import { createAddToGuestbookTool } from "@/app/sandbox/tools";
import type { ValidatedEntry } from "@/app/api/validate/route";

function mockValidate(handler: (body: unknown) => { status: number; json: unknown }) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const { status, json } = handler(body);
    return { ok: status < 400, status, json: async () => json } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const accepts = () => ({
  status: 200,
  json: { ok: true, entry: { name: "Marguerite", message: "Hello." } },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("submitGuestbookEntry", () => {
  it("appends only after the server accepts", async () => {
    mockValidate(accepts);
    const appended: ValidatedEntry[] = [];

    const outcome = await submitGuestbookEntry("Marguerite", "Hello.", (e) => appended.push(e));

    expect(outcome).toEqual({ status: "accepted", entry: { name: "Marguerite", message: "Hello." } });
    expect(appended).toHaveLength(1);
  });

  it("does not append when the server rejects", async () => {
    mockValidate(() => ({ status: 400, json: { ok: false, reason: "A name is required." } }));
    const appended: ValidatedEntry[] = [];

    const outcome = await submitGuestbookEntry("", "Hello.", (e) => appended.push(e));

    expect(outcome).toEqual({ status: "rejected", reason: "A name is required." });
    expect(appended).toHaveLength(0);
  });

  it("reports a transport failure as ambiguous, not as a rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const appended: ValidatedEntry[] = [];

    const outcome = await submitGuestbookEntry("Marguerite", "Hello.", (e) => appended.push(e));

    expect(outcome).toEqual({ status: "ambiguous" });
    expect(appended).toHaveLength(0);
  });

  it("serializes concurrent writes instead of interleaving them", async () => {
    const order: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, body.name === "first" ? 20 : 1));
        inFlight -= 1;
        order.push(body.name);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, entry: { name: body.name, message: body.message } }),
        } as unknown as Response;
      }),
    );

    const noop = () => {};
    await Promise.all([
      submitGuestbookEntry("first", "slow", noop),
      submitGuestbookEntry("second", "fast", noop),
    ]);

    expect(maxInFlight).toBe(1);
    expect(order).toEqual(["first", "second"]);
  });

  it("keeps the queue usable after a failed write", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, entry: { name: "Marguerite", message: "Hello." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const noop = () => {};
    expect(await submitGuestbookEntry("a", "b", noop)).toEqual({ status: "ambiguous" });
    expect(await submitGuestbookEntry("Marguerite", "Hello.", noop)).toMatchObject({
      status: "accepted",
    });
  });
});

describe("add_to_guestbook tool results", () => {
  const signal = new AbortController().signal;

  it("returns a CallToolResult on success, with no internal identifiers", async () => {
    mockValidate(accepts);
    const tool = createAddToGuestbookTool(() => {});

    const result = await tool.execute({ name: "Marguerite", message: "Hello." }, { signal });

    expect(result).toEqual({
      content: [{ type: "text", text: "Signed the guestbook as Marguerite." }],
    });
  });

  it("marks a rejection as an error and passes the written reason through", async () => {
    mockValidate(() => ({ status: 400, json: { ok: false, reason: "A message is required." } }));
    const tool = createAddToGuestbookTool(() => {});

    const result = await tool.execute({ name: "Marguerite", message: "" }, { signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("A message is required.");
  });

  it("declares itself mutating and untrusted", () => {
    const tool = createAddToGuestbookTool(() => {});
    expect(tool.annotations?.readOnlyHint).toBeUndefined();
    expect(tool.annotations?.untrustedContentHint).toBe(true);
  });
});
