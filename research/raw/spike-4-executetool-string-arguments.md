# Spike 4 result: getTools and executeTool pass JSON as strings (Chrome, captured 2026-08-27 during M1)

Captured against the deployed sandbox at https://web-mcp-hackathon2026.vercel.app/sandbox
by driving `document.modelContext` from the page console. Three registered tools:
`list_products` and `add_to_guestbook` (imperative), `sign_guestbook` (declarative).

## Findings, all of which contradict the `webmcp-types` package (0.1.5)

| Surface | `webmcp-types` says | Chrome actually does |
|---|---|---|
| `RegisteredTool.inputSchema` | `object` | A JSON **string** |
| `executeTool(tool, args)` args | `Record<string, unknown>`, optional | A JSON **string**, and **required** |
| `executeTool` return | `Promise<unknown>` resolving to a result object | A JSON **string** of the `CallToolResult` |

Evidence:

```js
await mc.executeTool(tool, {});                 // UnknownError: Failed to parse input arguments
await mc.executeTool(tool);                     // TypeError: 2 arguments required, but only 1 present
await mc.executeTool(tool, JSON.stringify({})); // '{"content":[{"type":"text","text":"3 items for sale:..."}]}'
```

`t.inputSchema?.properties` reads as `undefined` on a `RegisteredTool`, which looks like
an empty schema and is not. `JSON.parse(t.inputSchema)` gives the real thing.

Consequence for the in-page agent (M4): it must `JSON.parse` the schema before showing
or validating anything, `JSON.stringify` the arguments before every call, and
`JSON.parse` the result before reading `content`. A wrapper belongs in `lib/webmcp/`
so no call site handles raw strings. Do not trust the package's `.d.ts` on these three
points; `lib/webmcp/types.ts` overrides `executeTool` to match observed behaviour.

## Declarative synthesis, confirmed on our own form

Chrome synthesized `sign_guestbook` from the guestbook form's attributes:

```json
{"type":"object","properties":{"name":{"type":"string","description":"Who is signing the guestbook. 1 to 40 characters."},"message":{"type":"string","description":"The public message to leave. 1 to 280 characters."}},"required":["name","message"]}
```

Consistent with spike 2 on every point that applies here:

1. `required[]` mirrored from the `required` attributes on both fields.
2. Values typed as strings.
3. `maxlength="40"` and `maxlength="280"` did **not** become `maxLength`. The limits
   survive only because they are written into the `toolparamdescription` prose.
4. Annotations absent entirely (`annotations: null`), where the two imperative tools
   report `readOnlyHint` and `untrustedContentHint`. Forms cannot carry hints.

Point 3 is the concrete case for the generator's imperative emitter: our hand-written
`add_to_guestbook` carries real `minLength`/`maxLength`, the browser's synthesis of the
same fields does not. That is the quality gap the emitter is supposed to close.
