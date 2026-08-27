"use client";

/**
 * Registration manager (CLAUDE.md rule 4).
 *
 * Every `registerTool` call in this repo goes through here. Contract:
 *
 *   - Null-rendering component. Registration is a lifecycle concern, not a visual one,
 *     so the set of tools an agent sees stays in lockstep with what is on screen.
 *   - One `AbortController` per tool. Aborting is the only unregistration path.
 *   - Abort on unmount, so a removed component cannot leave a live tool behind.
 *   - Remount-safe: a mount/unmount/remount cycle (React StrictMode does exactly this)
 *     leaves exactly one registration, never two.
 *   - Budgets are enforced before registration, not after (rule 5). A tool that busts a
 *     budget does not register at all.
 *   - Feature-detected. Without `document.modelContext` this is inert and the page is
 *     unaffected (rule 1).
 *
 * Re-registration identity: the effect keys on the tool's declaration (name, title,
 * description, schema, annotations), not on the identity of `execute`. A parent that
 * re-renders with a fresh closure does not churn the registration; a genuine change to
 * the declaration does re-register.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatViolations, lintToolSpec } from "./budgets";
import { getModelContext } from "./types";
import type { ToolSpec } from "./types";

export interface ToolRegistrationStatus {
  /** `document.modelContext` exists in this environment. */
  supported: boolean;
  /** The tool is currently registered with the browser. */
  registered: boolean;
  /** Budget violation or registration failure, e.g. `NotAllowedError`. */
  error: Error | null;
}

/**
 * Chrome invokes `execute(input)` with no second argument, despite `webmcp-types`
 * declaring `options` as required. Rather than make every tool defensive about it, the
 * manager normalizes here, at the one point where a tool is handed to the browser, and
 * substitutes a signal that never fires. See
 * research/raw/spike-5-execute-called-without-options.md.
 */
const NEVER_ABORTED = new AbortController().signal;

const neverChanges = () => () => {};
const readSupported = () => getModelContext() !== undefined;
const readSupportedOnServer = () => false;

/**
 * Feature detection as a hook. Read through `useSyncExternalStore` so it is correct at
 * hydration and needs no state write from an effect.
 */
export function useWebMCPSupported(): boolean {
  return useSyncExternalStore(neverChanges, readSupported, readSupportedOnServer);
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Serializes the parts of a spec that decide whether re-registration is needed. */
function declarationKey(spec: ToolSpec): string {
  return JSON.stringify([
    spec.name,
    spec.title ?? null,
    spec.description,
    spec.inputSchema ?? null,
    spec.annotations ?? null,
  ]);
}

/**
 * Registers one tool for the lifetime of the calling component.
 *
 * `registered` is only ever written from the register promise's callbacks, so a
 * registration aborted before it resolves never reports success.
 */
export function useToolRegistration(spec: ToolSpec): ToolRegistrationStatus {
  const supported = useWebMCPSupported();
  const key = declarationKey(spec);

  // Budget violations are a pure function of the declaration, so they are derived, not
  // stored. A violating tool is a hard error: it does not register at all.
  const budgetError = useMemo(() => {
    const violations = lintToolSpec(spec);
    if (violations.length === 0) return null;
    return new Error(
      `Tool "${spec.name}" exceeds character budgets: ${formatViolations(violations)}`,
    );
    // Keyed on the declaration, not the spec object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The live spec, so `execute` can change between renders without re-registering.
  // Synced in its own effect, declared before the registration effect so it is already
  // current by the time registration runs. The initial value covers the first mount.
  const specRef = useRef(spec);
  useEffect(() => {
    specRef.current = spec;
  });

  const [outcome, setOutcome] = useState<{ registered: boolean; error: Error | null }>({
    registered: false,
    error: null,
  });

  useEffect(() => {
    if (!supported || budgetError) return;

    const modelContext = getModelContext();
    if (!modelContext) return;

    const controller = new AbortController();
    const declaration = specRef.current;

    void modelContext
      .registerTool(
        {
          name: declaration.name,
          title: declaration.title,
          description: declaration.description,
          inputSchema: declaration.inputSchema,
          annotations: declaration.annotations,
          // Delegated through the ref so the registered callback always runs the
          // current `execute`, without the registration depending on its identity.
          execute: (args: Record<string, unknown>, options?: { signal: AbortSignal }) =>
            specRef.current.execute(args, options ?? { signal: NEVER_ABORTED }),
        },
        { signal: controller.signal },
      )
      .then(() => {
        if (controller.signal.aborted) return;
        setOutcome({ registered: true, error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setOutcome({ registered: false, error: toError(cause) });
      });

    // The single unregistration path. Idempotent, and safe while the register promise
    // is still pending: an aborted signal unregisters whenever registration lands.
    return () => controller.abort();
  }, [key, supported, budgetError]);

  return {
    supported,
    registered: outcome.registered,
    error: budgetError ?? outcome.error,
  };
}

/** Rule 4's null-rendering component. Registers one tool while mounted. */
export function ToolRegistration({ spec }: { spec: ToolSpec }): null {
  const { error } = useToolRegistration(spec);
  useEffect(() => {
    if (error) console.error("[toolsmith] tool registration failed:", error.message);
  }, [error]);
  return null;
}

/** Registers a set of tools, one child component per tool. Renders nothing. */
export function ToolRegistrations({ specs }: { specs: readonly ToolSpec[] }) {
  return (
    <>
      {specs.map((spec) => (
        <ToolRegistration key={spec.name} spec={spec} />
      ))}
    </>
  );
}
