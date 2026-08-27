/**
 * Receipt ledger tests (CLAUDE.md rule 10).
 *
 * Three properties: every call lands, the signature actually verifies, and a tampered
 * receipt fails to verify. A signature nobody checks is decoration.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  appendReceipt,
  canonicalize,
  exportLedger,
  fingerprint,
  getLedger,
  getSessionPublicKey,
  redactArgs,
  resetLedger,
  signedPayload,
  verifyReceipt,
} from "@/lib/webmcp/receipt-ledger";

afterEach(() => resetLedger());

describe("appending", () => {
  it("records a call with its consent status and a sequence number", async () => {
    const receipt = await appendReceipt({
      tool: "list_products",
      args: {},
      resultSummary: "3 items for sale.",
      consent: "not-required",
    });

    expect(receipt.seq).toBe(1);
    expect(receipt.tool).toBe("list_products");
    expect(receipt.consent).toBe("not-required");
    expect(getLedger()).toHaveLength(1);
  });

  it("records refused calls too, not only the ones that ran", async () => {
    await appendReceipt({
      tool: "add_to_guestbook",
      args: { name: "A", message: "B" },
      resultSummary: "Failed: declined.",
      consent: "denied",
    });
    await appendReceipt({
      tool: "add_to_guestbook",
      args: { name: "A", message: "B" },
      resultSummary: "Failed: withdrawn.",
      consent: "canceled",
    });

    expect(getLedger().map((r) => r.consent)).toEqual(["denied", "canceled"]);
  });

  it("numbers receipts consecutively from one", async () => {
    for (let i = 0; i < 4; i += 1) {
      await appendReceipt({ tool: "t", args: {}, resultSummary: "x", consent: "approved" });
    }
    expect(getLedger().map((r) => r.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe("redaction and bounding", () => {
  it("drops anything whose name suggests a secret", () => {
    const redacted = redactArgs({
      message: "fine",
      api_key: "sk-live-123",
      sessionToken: "abc",
      PASSWORD: "hunter2",
      authorization: "Bearer x",
    });

    expect(redacted.message).toBe("fine");
    for (const key of ["api_key", "sessionToken", "PASSWORD", "authorization"]) {
      expect(redacted[key]).toBe("[redacted]");
    }
  });

  it("truncates long values", () => {
    const redacted = redactArgs({ message: "x".repeat(500) });
    expect(String(redacted.message)).toHaveLength(200);
    expect(String(redacted.message).endsWith("...")).toBe(true);
  });

  it("keeps non-string values as they are", () => {
    expect(redactArgs({ max_price: 10, flag: true })).toEqual({ max_price: 10, flag: true });
  });
});

describe("canonical serialization", () => {
  it("orders keys, so equal data serializes identically", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ a: 2, b: 1 })).toBe(canonicalize({ b: 1, a: 2 }));
  });

  it("orders nested keys too", () => {
    expect(canonicalize({ z: { d: 1, c: 2 } })).toBe('{"z":{"c":2,"d":1}}');
  });

  it("preserves array order, which is meaningful", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("omits undefined rather than emitting null for it", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("signing", () => {
  it("signs each receipt with the session key, and the signature verifies", async () => {
    const receipt = await appendReceipt({
      tool: "add_to_guestbook",
      args: { name: "Marguerite", message: "Hello." },
      resultSummary: "Signed the guestbook as Marguerite.",
      consent: "approved",
    });

    const publicKey = await getSessionPublicKey();
    expect(publicKey).toBeTruthy();
    expect(receipt.signature).toBeTruthy();
    await expect(verifyReceipt(receipt, publicKey!)).resolves.toBe(true);
  });

  it("fails verification when any signed field is altered", async () => {
    const receipt = await appendReceipt({
      tool: "add_to_guestbook",
      args: { name: "Marguerite", message: "Hello." },
      resultSummary: "Signed the guestbook as Marguerite.",
      consent: "approved",
    });
    const publicKey = (await getSessionPublicKey())!;

    const tampered = [
      { ...receipt, consent: "not-required" as const },
      { ...receipt, resultSummary: "Something else." },
      { ...receipt, args: { name: "Someone else", message: "Hello." } },
      { ...receipt, seq: 99 },
      { ...receipt, tool: "list_products" },
      { ...receipt, timestamp: new Date(0).toISOString() },
    ];

    for (const receiptCopy of tampered) {
      await expect(verifyReceipt(receiptCopy, publicKey)).resolves.toBe(false);
    }
  });

  it("rejects an unsigned receipt rather than treating it as valid", async () => {
    const receipt = await appendReceipt({
      tool: "t",
      args: {},
      resultSummary: "x",
      consent: "approved",
    });
    const publicKey = (await getSessionPublicKey())!;

    await expect(verifyReceipt({ ...receipt, signature: null }, publicKey)).resolves.toBe(false);
  });

  it("uses one key for the whole session", async () => {
    await appendReceipt({ tool: "a", args: {}, resultSummary: "x", consent: "approved" });
    const first = await getSessionPublicKey();
    await appendReceipt({ tool: "b", args: {}, resultSummary: "x", consent: "approved" });
    const second = await getSessionPublicKey();

    expect(first).toBe(second);
  });

  it("signs the sequence number, so a removed receipt is detectable", async () => {
    const a = await appendReceipt({ tool: "a", args: {}, resultSummary: "x", consent: "approved" });
    const b = await appendReceipt({ tool: "b", args: {}, resultSummary: "x", consent: "approved" });

    expect(signedPayload(a)).toContain('"seq":1');
    expect(signedPayload(b)).toContain('"seq":2');
    // Renumbering b to fill a's place breaks its signature.
    const publicKey = (await getSessionPublicKey())!;
    await expect(verifyReceipt({ ...b, seq: 1 }, publicKey)).resolves.toBe(false);
  });
});

describe("export", () => {
  it("carries the public key so the receipts can be checked without the page", async () => {
    await appendReceipt({
      tool: "list_products",
      args: {},
      resultSummary: "3 items.",
      consent: "not-required",
    });

    const exported = await exportLedger();

    expect(exported.algorithm).toBe("Ed25519");
    expect(exported.publicKey).toBe(await getSessionPublicKey());
    expect(exported.receipts).toHaveLength(1);
    expect(() => JSON.parse(JSON.stringify(exported))).not.toThrow();
  });

  it("exports receipts that still verify after a JSON round trip", async () => {
    await appendReceipt({
      tool: "add_to_guestbook",
      args: { name: "Marguerite", message: "Hello." },
      resultSummary: "Signed.",
      consent: "approved",
    });

    const exported = JSON.parse(JSON.stringify(await exportLedger()));
    await expect(verifyReceipt(exported.receipts[0], exported.publicKey)).resolves.toBe(true);
  });

  it("gives a short comparable fingerprint for the key", async () => {
    await appendReceipt({ tool: "t", args: {}, resultSummary: "x", consent: "approved" });
    const publicKey = (await getSessionPublicKey())!;

    const printed = fingerprint(publicKey);
    expect(printed).toHaveLength(16);
    expect(printed).toBe(printed.toUpperCase());
    expect(printed).toMatch(/^[A-Z0-9]+$/);
  });
});
