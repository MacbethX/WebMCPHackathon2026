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
| `lib/` | Non-route code: `lib/webmcp/` (runtime) and `lib/generator/` (the builder's engine). |
| `tests/` | Vitest suites and test doubles. |
| `research/` | The pre-build research pack. Committed as-is: never edited, only appended to as new files. Excluded from lint and typecheck. |
| `public/` | Static assets served at the root. |

## `app/`

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout. |
| `app/page.tsx` | The builder, at the root. |
| `app/globals.css` | Base styles. |
| `app/builder/builder.tsx` | The loop: paste, sanitize, propose, review, approve, register live. |
| `app/builder/proposal-card.tsx` | One proposal to read, edit, and approve. Renders the consent question from data, never as a checkbox. |
| `app/builder/agent-panel.tsx` | The in-page agent. Discovers via `getTools`, invokes via `executeTool`, never calls a tool function directly. |
| `app/builder/sample.ts` | A plain unannotated form to try the builder on. |
| `app/builder/builder.module.css` | Builder styling, including the pseudo-classes applied to pasted forms. |
| `app/api/validate/route.ts` | Server-side revalidation for sandbox mutations. The trust boundary. |
| `app/api/agent/route.ts` | The model proxy. Refines prose, or picks a tool. Never runs one. Key stays server-side. |
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
| `lib/webmcp/consent-gate.tsx` | Promise-gated human approval around `execute`. Module-level store, because the browser calls `execute` from outside the React tree. Read-only tools bypass, and so do declarative forms a person submits. |
| `lib/webmcp/receipt-ledger.ts` | Append-only signed record of every call. Ed25519 via WebCrypto, session key, canonical JSON, verification and export. |
| `lib/webmcp/receipt-ledger-panel.tsx` | Renders the ledger and exports it as JSON with the public key attached. |
| `lib/webmcp/trust.ts` | Composes the gate and the ledger into `withTrust`, which is what the app wraps its tools in. |
| `lib/webmcp/trust-layer.module.css` | Styling for the gate and the ledger. Self-contained, since these are the parts meant to be portable. |
| `lib/webmcp/agent-client.ts` | The only place that touches `getTools`/`executeTool`. Converts the JSON strings the real API uses (spike 4). |
| `lib/webmcp/use-registered-tools.ts` | The page's tool list, kept current by `toolchange` rather than polling. |

## `lib/generator/`

| Path | Purpose |
|---|---|
| `lib/generator/analyzed.ts` | What the analyzer extracts from markup. Plain data, no opinions. |
| `lib/generator/html-analyzer.ts` | HTML to structure, via DOMParser. Groups radio sets, refuses password and file inputs. |
| `lib/generator/proposal.ts` | The reviewable contract between analyzer, agent, human, and emitters. |
| `lib/generator/consent-design.ts` | `toolautosubmit` modelled as a consent decision, not a boolean. Three named checkpoints, fail closed. |
| `lib/generator/propose.ts` | Analysis to proposal: naming, drafting, and the declarative/imperative routing with stated reasons. |
| `lib/generator/declarative-emitter.ts` | Annotated form markup, plus a prediction of the schema Chrome will synthesize from it, quirks included. |
| `lib/generator/imperative-emitter.ts` | A standalone TypeScript module with real constraints, annotations, feature detection, and the spike 5 fallback. |
| `lib/generator/generate.ts` | The pipeline, with the budget linter run before anything is emitted. |
| `lib/generator/sanitize.ts` | Allowlist sanitizer for pasted markup, which the builder renders inside our origin. |
| `lib/generator/live-tool.ts` | An approved proposal as a running tool, acting on the preview form. |

## `lib/agent/`

| Path | Purpose |
|---|---|
| `lib/agent/contract.ts` | The wire format between page and proxy. The model decides; it never acts. |
| `lib/agent/provider.ts` | The model adapter. Anthropic is the exercised path; the OpenAI branch is written to spec and unverified. |

## `tests/`

| Path | Purpose |
|---|---|
| `tests/setup.ts` | jest-dom matchers, cleanup between tests. |
| `tests/model-context-fake.ts` | A `document.modelContext` double where a registration lives exactly as long as its AbortSignal. |
| `tests/registration-manager.test.tsx` | Mount, abort, remount, StrictMode, re-registration identity, degradation, budget refusal. |
| `tests/budgets.test.ts` | Every budget at its limit and one past it. Asserts this repo's own tools pass. |
| `tests/guestbook.test.ts` | Serialization, revalidation, ambiguity reporting, tool result shape. |
| `tests/validate.test.ts` | The server boundary: rejects what the schema would have allowed. |
| `tests/consent-gate.test.tsx` | Nothing runs before a human answers. Bypass, denial, withdrawal, queue depth. |
| `tests/receipt-ledger.test.ts` | Signatures verify, tampering fails, canonical JSON is stable, secrets are redacted. |
| `tests/trust.test.tsx` | The seam: read-only skips the gate but is still recorded, refusals leave verifiable receipts. |
| `tests/html-analyzer.test.ts` | Parsing: constraints, labels, radio grouping, and what it refuses to expose. |
| `tests/consent-design.test.ts` | The consent decision: available choices, fail-closed defaults, refusing choices never offered. |
| `tests/generator-golden.test.ts` | The M3 golden. Predicted declarative schema against the one Chrome actually produced in spike 2. |
| `tests/emitted-code-compiles.test.ts` | Runs the real compiler over emitted modules in strict mode. Slow, and the most valuable test here. |
| `tests/sanitize.test.ts` | Written as attacks, not features. A pass means the attack did not work. |
| `tests/agent-client.test.ts` | The JSON-string conversions from spike 4, against a fake that rejects object arguments like Chrome does. |
