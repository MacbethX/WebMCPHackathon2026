# File registry

Every top-level file and directory in this repo, and what it is for. Updated in the same
commit that adds or moves anything (CLAUDE.md, "File registry").

## Root

| Path | Purpose |
|---|---|
| `CLAUDE.md` | The authority for all Claude Code sessions here. Rules, architecture, milestones. |
| `README.md` | What Toolsmith is, why it exists, what it does. Public face. |
| `REGISTRY.md` | This file. |
| `LICENSE` | MIT. |
| `.nvmrc` | Node 22. The floor is 20.9, set by Next 16. |
| `.env.local` | Local secrets. Never committed; `.gitignore` covers it via `.env*`. |
| `package.json` | Dependencies and the four commands: `dev`, `build`, `lint`, `test`. |
| `next.config.ts` | Response headers. Asserts `Origin-Agent-Cluster: ?1` for origin isolation. |
| `tsconfig.json` | TypeScript config. Excludes `research/`. |
| `eslint.config.mjs` | ESLint config. Ignores `research/`. |
| `vitest.config.mts` | Test runner config. jsdom, `tests/**`. |

## Directories

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router. Pages, layout, API routes. |
| `lib/` | Non-route code. Currently `lib/webmcp/` only; `lib/generator/` arrives in M3. |
| `tests/` | Vitest suites and test doubles. |
| `research/` | The pre-build research pack. Committed as-is: never edited, only appended to as new files. Excluded from lint and typecheck. |
| `public/` | Static assets served at the root. |

## `app/`

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout. |
| `app/page.tsx` | Placeholder for the builder UI (M4). Points at the sandbox. |
| `app/globals.css` | Base styles. |
| `app/page.module.css` | Styles for the placeholder home page. |
| `app/api/validate/route.ts` | Server-side revalidation for sandbox mutations. The trust boundary. |
| `app/sandbox/page.tsx` | Sandbox route. Server component, metadata only. |
| `app/sandbox/storefront.tsx` | The shop UI, guestbook state, and the declarative `sign_guestbook` form. |
| `app/sandbox/tools.ts` | The two imperative tool declarations: `list_products`, `add_to_guestbook`. |
| `app/sandbox/catalog.ts` | The three products. |
| `app/sandbox/guestbook.ts` | The mutation path: serialized, revalidated, honest about ambiguity. |
| `app/sandbox/sandbox.module.css` | Shop styling, including the `:tool-form-active` rules. |

## `lib/webmcp/`

| Path | Purpose |
|---|---|
| `lib/webmcp/types.ts` | `CallToolResult`, `ToolSpec`, and the spec augmentations `webmcp-types` omits or gets wrong: `executeTool` (JSON strings in and out, see spike 4), `SubmitEvent.respondWith`, declarative form attributes in JSX. |
| `lib/webmcp/budgets.ts` | The character budgets and the linter that enforces them. |
| `lib/webmcp/tool-result.ts` | `CallToolResult` builders, bounded to the output budget. |
| `lib/webmcp/registration-manager.tsx` | The only path to `registerTool`. Null-render component, one AbortController per tool, remount-safe. |

Arriving later: `consent-gate` and `receipt-ledger` (M2), `lib/generator/` (M3).

## `tests/`

| Path | Purpose |
|---|---|
| `tests/setup.ts` | jest-dom matchers, cleanup between tests. |
| `tests/model-context-fake.ts` | A `document.modelContext` double where a registration lives exactly as long as its AbortSignal. |
| `tests/registration-manager.test.tsx` | Mount, abort, remount, StrictMode, re-registration identity, degradation, budget refusal. |
| `tests/budgets.test.ts` | Every budget at its limit and one past it. Asserts this repo's own tools pass. |
| `tests/guestbook.test.ts` | Serialization, revalidation, ambiguity reporting, tool result shape. |
| `tests/validate.test.ts` | The server boundary: rejects what the schema would have allowed. |
