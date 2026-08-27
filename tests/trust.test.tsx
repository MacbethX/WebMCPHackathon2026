/**
 * Trust layer composition tests (CLAUDE.md rules 9 and 10 together).
 *
 * The gate and the ledger are each tested on their own. What this file checks is the
 * seam: that a read-only tool skips the gate but is still recorded, and that a refused
 * call leaves a receipt saying it was refused rather than leaving no trace.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsentGate, resetConsentQueue } from "@/lib/webmcp/consent-gate";
import { getLedger, resetLedger, verifyReceipt, getSessionPublicKey } from "@/lib/webmcp/receipt-ledger";
import { toolError, toolText } from "@/lib/webmcp/tool-result";
import { summarize, withTrust } from "@/lib/webmcp/trust";
import type { CallToolResult, ToolSpec } from "@/lib/webmcp/types";

const readOnly: ToolSpec = {
  name: "list_things",
  description: "Lists the things.",
  annotations: { readOnlyHint: true },
  execute: () => toolText("Two things."),
};

const mutating: ToolSpec<{ note: string }> = {
  name: "leave_note",
  title: "Leave a note",
  description: "Pins a note to the page.",
  execute: ({ note }) => toolText(`Pinned: ${note}`),
};

function invoke(
  start: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  let call!: Promise<CallToolResult>;
  act(() => {
    call = Promise.resolve(start());
  });
  return call;
}

const signal = () => new AbortController().signal;

afterEach(() => {
  act(() => resetConsentQueue());
  resetLedger();
  vi.restoreAllMocks();
});

describe("read-only tools", () => {
  it("run without a prompt but still leave a receipt", async () => {
    render(<ConsentGate />);

    const result = await invoke(() => withTrust(readOnly).execute({}, { signal: signal() }));

    expect(result).toEqual({ content: [{ type: "text", text: "Two things." }] });
    expect(screen.queryByText(/wants to run/i)).not.toBeInTheDocument();

    const [receipt] = getLedger();
    expect(receipt).toMatchObject({
      tool: "list_things",
      consent: "not-required",
      resultSummary: "Two things.",
    });
    expect(receipt.signature).toBeTruthy();
  });
});

describe("mutating tools", () => {
  it("record an approved call with its result", async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    const call = invoke(() => withTrust(mutating).execute({ note: "hi" }, { signal: signal() }));
    await screen.findByText(/wants to run/i);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    await call;

    const [receipt] = getLedger();
    expect(receipt).toMatchObject({
      tool: "leave_note",
      consent: "approved",
      resultSummary: "Pinned: hi",
      args: { note: "hi" },
    });
  });

  it("record a denied call, and do not run it", async () => {
    const user = userEvent.setup();
    const execute = vi.fn(() => toolText("Pinned."));
    render(<ConsentGate />);

    const call = invoke(() =>
      withTrust({ ...mutating, execute }).execute({ note: "hi" }, { signal: signal() }),
    );
    await screen.findByText(/wants to run/i);
    await user.click(screen.getByRole("button", { name: /deny/i }));
    await call;

    expect(execute).not.toHaveBeenCalled();

    const [receipt] = getLedger();
    expect(receipt.consent).toBe("denied");
    expect(receipt.resultSummary).toContain("declined");
    expect(receipt.args).toEqual({ note: "hi" });
  });

  it("record a withdrawn call as withdrawn, not as a denial", async () => {
    const controller = new AbortController();
    render(<ConsentGate />);

    const call = invoke(() =>
      withTrust(mutating).execute({ note: "hi" }, { signal: controller.signal }),
    );
    await screen.findByText(/wants to run/i);
    act(() => controller.abort());
    await call;

    expect(getLedger()[0].consent).toBe("canceled");
  });

  it("leave a verifiable receipt for a refusal, same as for a success", async () => {
    const user = userEvent.setup();
    render(<ConsentGate />);

    const call = invoke(() => withTrust(mutating).execute({ note: "hi" }, { signal: signal() }));
    await screen.findByText(/wants to run/i);
    await user.click(screen.getByRole("button", { name: /deny/i }));
    await call;

    const publicKey = (await getSessionPublicKey())!;
    await expect(verifyReceipt(getLedger()[0], publicKey)).resolves.toBe(true);
  });
});

describe("summarize", () => {
  it("passes a success through, collapsing whitespace", () => {
    expect(summarize(toolText("3 items:\nOne\nTwo"))).toBe("3 items: One Two");
  });

  it("marks a failure as one, so the ledger does not read like a success", () => {
    expect(summarize(toolError("Nope."))).toBe("Failed: Nope.");
  });

  it("says something when the result carries no text", () => {
    expect(summarize({ content: [] })).toBe("Done, with no message.");
    expect(summarize({ content: [], isError: true })).toBe("Failed, with no message.");
  });
});
