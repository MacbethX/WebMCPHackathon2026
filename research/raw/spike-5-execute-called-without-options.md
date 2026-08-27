# Spike 5 result: Chrome calls execute with one argument (Chrome 151, captured 2026-08-27 during M2)

Found by calling `add_to_guestbook` through `document.modelContext.executeTool` on the
sandbox. The call failed with:

```
UnknownError: Tool was executed but the invocation failed. For example, the script function threw an error
```

The page console carried the real cause:

```
TypeError: Cannot read properties of undefined (reading 'signal')
    at Object.execute (...)
```

## The finding

`webmcp-types` 0.1.5 declares the execute callback as:

```ts
type ToolExecuteCallback<T> = (inputObject: T, options: ToolExecuteCallbackOptions) => MaybePromise<unknown>;
```

`options` is not optional there, and `ToolExecuteCallbackOptions.signal` is not optional
either. Chrome 151 invokes `execute(input)` with a **single argument**. Any tool that
destructures or reads `options` throws, and the throw reaches the agent as the generic
`UnknownError` above, with no hint about what actually went wrong.

This is the fourth place `webmcp-types` disagrees with the browser. The other three are
in spike 4.

## Consequences

1. Never read `options` without a fallback. Toolsmith normalizes once, in
   `lib/webmcp/registration-manager.tsx`, at the single point where a tool is handed to
   the browser: a missing `options` becomes `{ signal }` with a signal that never fires.
   Everything downstream keeps the strict type.
2. **Browser-initiated calls carry no AbortSignal today.** Cancellation plumbing exists
   in the spec and in our code, but nothing on the browser side currently triggers it.
   The consent gate's withdraw-on-abort path is therefore unreachable from a browser
   agent right now. It stays, because the in-page agent (M4) passes its own signal
   through `executeTool`, and because the browser is likely to start passing one.
3. The generator's imperative emitter must emit the same fallback. Code that reads
   `options.signal` directly is code that throws in the current Chrome.

## Debugging note

The agent-visible error is useless on its own: "the script function threw an error" with
no message, no stack, no tool name. When a tool call fails this way, read the page
console. That is where the actual exception is.

Also: awaiting `executeTool` inside a single CDP `Runtime.evaluate` freezes the renderer
when the tool's `execute` is async, because the evaluation holds the turn the tool needs
in order to resolve. Fire the call, stash the promise on `globalThis`, and read the
result in a second evaluation. This is a harness artifact, not a page bug.
