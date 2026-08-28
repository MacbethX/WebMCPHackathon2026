/// <reference types="webmcp-types" />

/**
 * WebMCP types for Toolsmith.
 *
 * `webmcp-types` supplies the ambient `WebMCP` namespace and `Document.modelContext`.
 * It stops short of the parts of the spec we rely on, so we augment here rather than
 * hand-roll a second copy of the API surface:
 *
 *   - `ModelContext.executeTool`, the in-page agent's invocation path (CLAUDE.md architecture).
 *   - `SubmitEvent.respondWith` / `agentInvoked`, the declarative form response path.
 *   - The declarative form attributes, so JSX accepts them without `any`.
 *
 * Target is `document.modelContext` only. `navigator.modelContext` is stale early-2026
 * naming and must never appear in this repo (CLAUDE.md rule 1).
 */

/** MCP `CallToolResult`. Every tool in this repo returns this shape (CLAUDE.md rule 7). */
export interface CallToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}


/**
 * A tool as Toolsmith declares it. Structurally a `WebMCP.ModelContextTool` with a
 * required, narrowed result type and a required description.
 */
export interface ToolSpec<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonSchemaObject;
  annotations?: WebMCP.ToolAnnotations;
  /**
   * Method shorthand, deliberately. It makes `ToolSpec` bivariant in `TArgs`, so a
   * precisely-typed tool is assignable to the erased `ToolSpec` the registration
   * manager holds. The alternative is `any` at every call site.
   */
  execute(
    args: TArgs,
    options: { signal: AbortSignal },
  ): CallToolResult | Promise<CallToolResult>;
}

/** The subset of JSON Schema our tools and generator emit. */
export interface JsonSchemaObject {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  format?: string;
  pattern?: string;
  enum?: string[];
  /** Chrome's synthesis shape: const/title branches alongside a redundant flat enum. */
  anyOf?: Array<{ type?: string; const: string; title?: string }>;
  /** The idiomatic way to carry option labels. What our own emitter produces. */
  oneOf?: Array<{ type?: string; const: string; title?: string }>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

declare global {
  // Augmenting `webmcp-types`' ambient namespace requires `namespace`; there is no
  // module-syntax equivalent for adding members to a global declaration.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace WebMCP {
    interface ModelContext {
      /**
       * Invokes a tool on behalf of an author-provided (in-page) agent. Spec-native
       * surface; the browser mediates and the call runs in the tool owner's context.
       *
       * Typed against observed Chrome behaviour, not against `webmcp-types`, which is
       * wrong on all three points here. See
       * research/raw/spike-4-executetool-string-arguments.md:
       *
       *   - `args` is a JSON string, not an object. Passing an object fails with
       *     `UnknownError: Failed to parse input arguments`.
       *   - `args` is required, not optional. Omitting it throws a TypeError.
       *   - The result is a JSON string of a CallToolResult, not the object itself.
       *
       * `RegisteredTool.inputSchema` is likewise a JSON string despite being declared
       * `object`. Reading `.properties` off it silently yields undefined.
       */
      executeTool(
        tool: WebMCP.RegisteredTool,
        args: string,
        options?: { signal?: AbortSignal },
      ): Promise<string>;
    }

    interface ModelContextEventMap {
      toolactivated: Event;
      toolcanceled: Event;
    }
  }

  interface SubmitEvent {
    /** True when the submission came from an agent rather than a person. */
    readonly agentInvoked?: boolean;
    /**
     * Overrides the form's default submission and pipes a response back to the agent
     * with no navigation. `preventDefault()` must be called first.
     */
    respondWith?(agentResponse: Promise<unknown>): void;
  }
}

declare module "react" {
  interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
    /** Declarative API: the synthesized tool's name. */
    toolname?: string;
    /** Declarative API: the synthesized tool's description. */
    tooldescription?: string;
    /** Declarative API: allow the agent to submit without a human check. Opt-in only. */
    toolautosubmit?: boolean | "";
  }

  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    /** Declarative API: per-parameter description for this field. */
    toolparamdescription?: string;
  }

  interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
    /** Declarative API: per-parameter description for this field. */
    toolparamdescription?: string;
  }

  interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
    /** Declarative API: per-parameter description for this field. */
    toolparamdescription?: string;
  }
}

/** Feature detection. The site must work normally without WebMCP (CLAUDE.md rule 1). */
export function getModelContext(): WebMCP.ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  return document.modelContext;
}
