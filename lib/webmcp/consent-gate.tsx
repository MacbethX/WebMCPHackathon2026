"use client";

/**
 * Consent gate (CLAUDE.md rule 9).
 *
 * Every state-changing tool call waits on a human before it does anything. The gate
 * wraps `execute`, so it works for any agent that calls the tool: the browser's, an
 * extension's, or the in-page one. Tools annotated `readOnlyHint: true` bypass it.
 *
 * This lives app-side because the platform has not settled consent. The spec draft has
 * `requestUserInteraction()` on ModelContextClient and nothing implemented, with
 * prompting and elicitation still open (webmcp issues #165, #176, #50). Until that
 * lands, a gate in `execute` is the only place that works with every caller.
 *
 * The store is module-level rather than React context: `execute` is called by the
 * browser, not from inside the React tree, so it cannot reach a context. The UI
 * subscribes to the same store.
 */

import { useSyncExternalStore } from "react";
import { toolError } from "./tool-result";
import styles from "./trust-layer.module.css";
import type { CallToolResult, ToolSpec } from "./types";

export type ConsentDecision = "approved" | "denied" | "canceled";

export interface ConsentRequest {
  id: string;
  /** Tool name as the agent sees it. */
  toolName: string;
  /** Human-facing label, falling back to the name. */
  title: string;
  /** The tool's own description of what it does. */
  description: string;
  /** Arguments the agent proposed, shown verbatim so a person can check them. */
  args: Record<string, unknown>;
  decide: (decision: ConsentDecision) => void;
}

let counter = 0;
const nextRequestId = () => `consent_${(counter += 1)}`;

/**
 * One frozen empty array, shared. `getServerSnapshot` must return a referentially
 * stable value: a fresh `[]` per call makes React believe the store changed on every
 * render and it spins.
 */
const NO_REQUESTS: readonly ConsentRequest[] = Object.freeze([]);

let pending: readonly ConsentRequest[] = NO_REQUESTS;
const listeners = new Set<() => void>();

function publish(next: readonly ConsentRequest[]): void {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => pending;
const getServerSnapshot = () => NO_REQUESTS;

/** The queue of requests waiting on a human. Empty on the server. */
export function usePendingConsent(): readonly ConsentRequest[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test seam. Drops every pending request as canceled. */
export function resetConsentQueue(): void {
  const dropped = pending;
  publish(NO_REQUESTS);
  for (const request of dropped) request.decide("canceled");
}

/**
 * Asks a human to approve one call, and resolves when they answer.
 *
 * If the agent aborts while the request is on screen, the request is withdrawn and
 * resolves `canceled`. A withdrawn request never becomes an approval.
 */
export function requestConsent(
  input: Omit<ConsentRequest, "id" | "decide">,
  signal?: AbortSignal,
): Promise<ConsentDecision> {
  return new Promise<ConsentDecision>((resolve) => {
    const id = nextRequestId();
    let settled = false;

    const settle = (decision: ConsentDecision) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      publish(pending.filter((request) => request.id !== id));
      resolve(decision);
    };

    const onAbort = () => settle("canceled");

    if (signal?.aborted) {
      resolve("canceled");
      return;
    }
    signal?.addEventListener("abort", onAbort);

    publish([...pending, { id, ...input, decide: settle }]);
  });
}

/** True when the tool declares itself non-mutating and may skip the gate. */
export function bypassesConsent(spec: Pick<ToolSpec, "annotations">): boolean {
  return spec.annotations?.readOnlyHint === true;
}

/**
 * What a refused call returns. Denial and withdrawal read differently to an agent:
 * a denial is an answer, a withdrawal is the absence of one. Neither changed anything,
 * and both say so, because an agent that cannot tell refusal from failure will retry.
 */
export function consentRefusalResult(decision: ConsentDecision): CallToolResult {
  return toolError(
    decision === "denied"
      ? "The person using this page declined the request. Nothing was changed."
      : "The request was withdrawn before anyone answered. Nothing was changed.",
  );
}

/**
 * Whether an agent-originated form submission still needs our gate.
 *
 * Chrome sets `SubmitEvent.agentInvoked` on a form the agent filled, even when a person
 * pressed the button themselves. So `agentInvoked` alone is the wrong test: gating on it
 * asks for approval a second time, right after the human check the platform already
 * enforced.
 *
 * The real question is whether a human was in the loop at all, and the attribute that
 * decides that is `toolautosubmit`. Without it the browser fills the form and waits for
 * a person to submit, which is the consent event. With it the agent submits unattended,
 * and our gate is the only thing standing there.
 *
 * See research/raw/spike-6-agentinvoked-on-human-submit.md.
 */
export function formSubmissionNeedsConsent(submission: {
  agentInvoked: boolean;
  autoSubmit: boolean;
}): boolean {
  return submission.agentInvoked && submission.autoSubmit;
}

/**
 * Wraps `execute` with the gate. Read-only tools are returned untouched, so they carry
 * no wrapper overhead and no chance of a stray prompt.
 */
export function withConsent<TArgs extends Record<string, unknown>>(
  spec: ToolSpec<TArgs>,
): ToolSpec<TArgs> {
  if (bypassesConsent(spec)) return spec;

  return {
    ...spec,
    async execute(args, options): Promise<CallToolResult> {
      const decision = await requestConsent(
        {
          toolName: spec.name,
          title: spec.title ?? spec.name,
          description: spec.description,
          args,
        },
        options.signal,
      );

      if (decision !== "approved") return consentRefusalResult(decision);

      return spec.execute(args, options);
    },
  };
}

/**
 * The approval UI. Renders the oldest pending request; mutations are serialized, so in
 * practice there is at most one. Renders nothing when the queue is empty, which is also
 * what the server renders.
 */
export function ConsentGate() {
  const queue = usePendingConsent();
  const request = queue[0];
  if (!request) return null;

  const entries = Object.entries(request.args).filter(([, value]) => value !== undefined);

  return (
    <div className={styles.gate} role="alertdialog" aria-labelledby={`${request.id}_title`}>
      <p className={styles.gateTitle} id={`${request.id}_title`}>
        An agent wants to run <strong>{request.title}</strong>.{" "}
        {/* The machine name too: two tools on a page can share a human-facing title,
            and the person approving needs to know which one is asking. */}
        <span className={styles.gateToolName}>{request.toolName}</span>
      </p>
      <p className={styles.gateDescription}>{request.description}</p>

      <div className={styles.args}>
        {entries.length > 0 ? (
          entries.map(([key, value]) => (
            <div className={styles.argRow} key={key}>
              <span className={styles.argKey}>{key}</span>
              <p className={styles.argValue}>
                {typeof value === "string" ? value : JSON.stringify(value)}
              </p>
            </div>
          ))
        ) : (
          <p className={styles.argValue}>No arguments.</p>
        )}
      </div>

      <div className={styles.gateActions}>
        <button className={styles.approve} type="button" onClick={() => request.decide("approved")}>
          Approve
        </button>
        <button className={styles.deny} type="button" onClick={() => request.decide("denied")}>
          Deny
        </button>
        {queue.length > 1 ? (
          <p className={styles.queueDepth}>{queue.length - 1} more waiting</p>
        ) : null}
      </div>
    </div>
  );
}
