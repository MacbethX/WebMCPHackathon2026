import { vi } from "vitest";

export interface FakeRegistration {
  tool: WebMCP.ModelContextTool;
  signal?: AbortSignal;
  aborted: boolean;
}

export interface FakeModelContext {
  /** Every registration ever attempted, in order, including aborted ones. */
  all: FakeRegistration[];
  /** Registrations whose AbortSignal has not fired: what an agent would actually see. */
  live: () => FakeRegistration[];
  registerTool: ReturnType<typeof vi.fn>;
  uninstall: () => void;
}

/**
 * A stand-in for `document.modelContext` that models the one behaviour the registration
 * manager depends on: a registration lives exactly as long as its AbortSignal is
 * unaborted. Registering with an already-aborted signal registers nothing.
 */
export function installFakeModelContext(): FakeModelContext {
  const all: FakeRegistration[] = [];

  const registerTool = vi.fn(
    async (tool: WebMCP.ModelContextTool, options?: { signal?: AbortSignal }) => {
      const record: FakeRegistration = {
        tool,
        signal: options?.signal,
        aborted: options?.signal?.aborted ?? false,
      };
      options?.signal?.addEventListener("abort", () => {
        record.aborted = true;
      });
      all.push(record);
    },
  );

  const modelContext = Object.assign(new EventTarget(), {
    registerTool,
    getTools: vi.fn(async () => all.filter((r) => !r.aborted).map((r) => r.tool)),
    executeTool: vi.fn(),
    ontoolchange: null,
  });

  Object.defineProperty(document, "modelContext", {
    configurable: true,
    writable: true,
    value: modelContext,
  });

  return {
    all,
    live: () => all.filter((r) => !r.aborted),
    registerTool,
    uninstall: () => {
      Reflect.deleteProperty(document, "modelContext");
    },
  };
}

/** Removes any `document.modelContext` left behind, for the no-WebMCP cases. */
export function removeModelContext(): void {
  Reflect.deleteProperty(document, "modelContext");
}
