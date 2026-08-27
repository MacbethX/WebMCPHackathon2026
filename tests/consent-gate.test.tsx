/**
 * Consent gate tests (CLAUDE.md rule 9).
 *
 * The property that matters: nothing state-changing runs before a human answers, and a
 * refusal is distinguishable from a failure. Read-only tools never reach the gate.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConsentGate,
  bypassesConsent,
  formSubmissionNeedsConsent,
  requestConsent,
  resetConsentQueue,
  withConsent,
} from "@/lib/webmcp/consent-gate";
import { toolText } from "@/lib/webmcp/tool-result";
import type { CallToolResult, ToolSpec } from "@/lib/webmcp/types";

const mutating: ToolSpec<{ note: string }> = {
  name: "leave_note",
  title: "Leave a note",
  description: "Pins a note to the page for everyone to see.",
  execute: ({ note }) => toolText(`Pinned: ${note}`),
};

const readOnly: ToolSpec = {
  name: "read_notes",
  description: "Lists the notes already on the page.",
  annotations: { readOnlyHint: true },
  execute: () => toolText("One note."),
};

/**
 * Starts a tool call and lets React flush the resulting store update.
 *
 * `requestConsent` publishes to a module-level store, not to React state, so the
 * re-render it causes happens outside anything the test kicked off. Without act() every
 * one of these logs a warning and the assertions race the render.
 */
function invoke(
  start: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  let call!: Promise<CallToolResult>;
  act(() => {
    call = Promise.resolve(start());
  });
  return call;
}

afterEach(() => {
  // Vitest runs afterEach hooks last-registered-first, so this fires while the gate is
  // still mounted, before the cleanup registered in tests/setup.ts. Draining the queue
  // re-renders it, which has to happen inside act.
  act(() => resetConsentQueue());
  vi.restoreAllMocks();
});

describe("bypass", () => {
  it("lets a readOnlyHint tool through untouched", () => {
    expect(bypassesConsent(readOnly)).toBe(true);
    expect(withConsent(readOnly)).toBe(readOnly);
  });

  it("does not let a tool without the hint through", () => {
    expect(bypassesConsent(mutating)).toBe(false);
    expect(withConsent(mutating)).not.toBe(mutating);
  });

  it("treats a tool that is explicitly not read-only as mutating", () => {
    expect(bypassesConsent({ annotations: { readOnlyHint: false } })).toBe(false);
    expect(bypassesConsent({ annotations: {} })).toBe(false);
    expect(bypassesConsent({})).toBe(false);
  });
});

describe("gating", () => {
  it("does not run execute until a human approves", async () => {
    const user = userEvent.setup();
    const execute = vi.fn(() => toolText("Pinned."));
    const gated = withConsent({ ...mutating, execute });

    render(<ConsentGate />);
    const call = invoke(() =>
      gated.execute({ note: "hello" }, { signal: new AbortController().signal }),
    );

    await screen.findByText(/wants to run/i);
    expect(execute).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /approve/i }));

    await expect(call).resolves.toEqual({ content: [{ type: "text", text: "Pinned." }] });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("never runs execute when denied, and says nothing changed", async () => {
    const user = userEvent.setup();
    const execute = vi.fn(() => toolText("Pinned."));
    const gated = withConsent({ ...mutating, execute });

    render(<ConsentGate />);
    const call = invoke(() =>
      gated.execute({ note: "hello" }, { signal: new AbortController().signal }),
    );

    await screen.findByText(/wants to run/i);
    await user.click(screen.getByRole("button", { name: /deny/i }));

    const result = await call;
    expect(execute).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("declined");
    expect(result.content[0].text).toContain("Nothing was changed");
  });

  it("shows the agent's proposed arguments so a person can check them", async () => {
    const gated = withConsent(mutating);
    render(<ConsentGate />);
    invoke(() =>
      gated.execute({ note: "check me" }, { signal: new AbortController().signal }),
    );

    await screen.findByText(/wants to run/i);
    expect(screen.getByText("note")).toBeInTheDocument();
    expect(screen.getByText("check me")).toBeInTheDocument();
    expect(screen.getByText(mutating.description)).toBeInTheDocument();
  });

  it("clears the prompt once answered", async () => {
    const user = userEvent.setup();
    const gated = withConsent(mutating);
    render(<ConsentGate />);
    const call = invoke(() =>
      gated.execute({ note: "hello" }, { signal: new AbortController().signal }),
    );

    await screen.findByText(/wants to run/i);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    await call;

    await waitFor(() => expect(screen.queryByText(/wants to run/i)).not.toBeInTheDocument());
  });

  it("bypasses the gate entirely for a read-only tool", async () => {
    render(<ConsentGate />);
    const result = await invoke(() =>
      withConsent(readOnly).execute({}, { signal: new AbortController().signal }),
    );

    expect(result).toEqual({ content: [{ type: "text", text: "One note." }] });
    expect(screen.queryByText(/wants to run/i)).not.toBeInTheDocument();
  });
});

describe("withdrawal", () => {
  it("withdraws the request when the agent aborts, and reports it as not a denial", async () => {
    const controller = new AbortController();
    const execute = vi.fn(() => toolText("Pinned."));
    const gated = withConsent({ ...mutating, execute });

    render(<ConsentGate />);
    const call = invoke(() =>
      gated.execute({ note: "hello" }, { signal: controller.signal }),
    );
    await screen.findByText(/wants to run/i);

    act(() => controller.abort());

    const result = await call;
    expect(execute).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("withdrawn");
    await waitFor(() => expect(screen.queryByText(/wants to run/i)).not.toBeInTheDocument());
  });

  it("resolves canceled immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestConsent(
        { toolName: "t", title: "t", description: "d", args: {} },
        controller.signal,
      ),
    ).resolves.toBe("canceled");
  });

  it("ignores a second answer once settled", async () => {
    const user = userEvent.setup();
    const gated = withConsent(mutating);
    render(<ConsentGate />);
    const call = invoke(() =>
      gated.execute({ note: "hello" }, { signal: new AbortController().signal }),
    );

    await screen.findByText(/wants to run/i);
    const approve = screen.getByRole("button", { name: /approve/i });
    await user.click(approve);
    await call;

    // The prompt is gone, so a stale reference cannot flip the decision.
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });
});

describe("queue", () => {
  it("shows one request at a time and reports the backlog", async () => {
    const gated = withConsent(mutating);
    render(<ConsentGate />);

    void invoke(() =>
      gated.execute({ note: "first" }, { signal: new AbortController().signal }),
    );
    void invoke(() =>
      gated.execute({ note: "second" }, { signal: new AbortController().signal }),
    );

    await screen.findByText(/wants to run/i);
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.queryByText("second")).not.toBeInTheDocument();
    expect(screen.getByText(/1 more waiting/)).toBeInTheDocument();
  });
});

describe("declarative form submissions", () => {
  // Chrome sets agentInvoked on any form the agent filled, including ones a person then
  // submits by hand. See research/raw/spike-6-declarative-form-consent.md.
  it("does not gate an agent-filled form that a person submitted", () => {
    expect(formSubmissionNeedsConsent({ agentInvoked: true, autoSubmit: false })).toBe(false);
  });

  it("gates a form the agent submits unattended", () => {
    expect(formSubmissionNeedsConsent({ agentInvoked: true, autoSubmit: true })).toBe(true);
  });

  it("does not gate a submission no agent was involved in", () => {
    expect(formSubmissionNeedsConsent({ agentInvoked: false, autoSubmit: false })).toBe(false);
    expect(formSubmissionNeedsConsent({ agentInvoked: false, autoSubmit: true })).toBe(false);
  });
});
