# CLAUDE.md: Toolsmith

Owner: Andrew Stein (@MacbethX) | Version: 2.0 (portfolio edition) | Status: Operational
Repo: github.com/MacbethX/WebMCPHackathon2026 | Deploy: Vercel (team_6TcRo2z2yVUK9Xq6stOFpBUE) | License: MIT

This file is the authority for all Claude Code sessions in this repo. It overrides conventions elsewhere. Read research/00_INDEX.md before touching WebMCP-specific code.

## What Toolsmith is

Toolsmith is where a human and an AI agent make a website agent-ready, together. Paste site HTML; an in-page agent proposes WebMCP tools; the human edits and approves each; a generator emits real code; a live sandbox registers the tools immediately so any agent (the in-page one, or a visitor's browser agent) can use them. Every state-changing call passes a consent gate; every call lands in a signed, human-readable receipt ledger.

Origin story (for README, keep): named after the Splunk web-stack upgrade, where tooling helped thousands of ecosystem apps migrate quickly. Same shape: platform shift, long tail without engineering teams, tooling that does the heavy lifting.

This was built for the OpenAI WebMCP Challenge; Andrew was disqualified on an employer conflict rule (Google employee, Google Chrome was a sponsor). The project continues as a public portfolio piece. No deadline. Quality bar unchanged.

## Non-negotiable technical rules

1. Target `document.modelContext` ONLY. Never emit or use `navigator.modelContext` (stale early-2026 naming). Feature-detect; the site must work normally without WebMCP.
2. Single origin. WebMCP requires origin-isolated documents: never set `Origin-Agent-Cluster: ?0`, never use `document.domain`. Verify deployed response headers before debugging anything else.
3. Permissions policy `tools` defaults to self; do not add cross-origin iframes needing tools without `allow="tools"` and a written reason.
4. Registration lifecycle: every `registerTool` goes through the registration manager (null-rendering component, one AbortController per tool, abort on unmount, remount-safe with no duplicates). Test the mount/abort/remount cycle.
5. Character budgets are lint errors, not warnings: tool name and param names <=30 chars, tool description <=500, param descriptions <=150, tool output <=1500. The generator's linter enforces these on emitted code AND our own tools obey them.
6. Annotations: `readOnlyHint` on every non-mutating tool; `untrustedContentHint` on anything returning user-supplied or external content.
7. Tool results are MCP CallToolResult shape: `{ content: [{ type: "text", text }] }`. Bounded, reduced, redacted: no internal IDs, no raw upstream errors, no capability-granting URLs.
8. Mutations: revalidate all arguments at the boundary (server route or sandbox state manager) regardless of schema; serialize concurrent mutations; on ambiguous outcome, report unsafe-to-retry rather than guessing.
9. Consent gate wraps `execute` for every state-changing tool: promise-gated UI approval; `readOnlyHint: true` tools bypass. Gate and ledger live app-side by design (spec has no settled consent: issues #165/#176; cite in README).
10. Receipt ledger: every tool call (gated or not) appends {timestamp, tool, args, resultSummary, consent status}, signed Ed25519 via WebCrypto with a session-generated key. Human-readable rendering plus JSON export. Never log secrets.

## Generator rules (evidence-based; see research/raw/spike-2-chrome-declarative-synthesis.md)

Routing: declarative output for form-shaped actions; imperative for everything else and whenever hints or strict validation matter (declarative tools cannot carry hints at all).

Declarative emitter: `toolname`, `tooldescription`, `toolparamdescription` per input; `toolautosubmit` only when the human explicitly opts in. Mirror Chrome synthesis conventions: string-typed form values; selects as dual shape (anyOf of {const,title} branches PLUS flat enum); required[] mirrored from required attributes; date inputs get format:"date".

Imperative emitter: exceed Chrome's synthesis quality: proper `pattern`/`minLength`/`minimum` instead of validation-in-prose; hints; AbortSignal wiring; feature detection wrapper. Emitted code must pass our own linter.

## Architecture

Next.js App Router + TypeScript, single Vercel deployment.
- `/` builder UI: paste HTML -> agent proposals -> review/edit/approve -> live registration.
- `/sandbox` toy demo site (small retro personal storefront; keep it charming and tiny; it exists to be tooled, not to compete with commerce demos).
- `/api/agent` model proxy, key server-side only.
- `/api/validate` server-side revalidation for sandbox mutations.
- `lib/webmcp/`: registration-manager, receipt-ledger, consent-gate, budget-linter, types (npm `webmcp-types`).
- `lib/generator/`: html-analyzer, proposal schema, declarative-emitter, imperative-emitter.
- `research/`: the research pack (committed as-is; do not edit, append new findings as new files).

In-page agent: discovers tools via `document.modelContext.getTools()` and invokes via `executeTool()` (spec-native author-provided agent; this surface is a differentiator, use it, do not shortcut by calling tool functions directly).

Model provider: thin adapter in `/api/agent`. Default Anthropic Messages API (Claude, structured JSON via prompt) since Andrew builds with Claude Code and holds a key; OpenAI Responses API (GPT-5.6, structured outputs) as the alternate. One env var switches: `MODEL_PROVIDER=anthropic|openai`, plus `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Never expose keys client-side.

## Quality bar

The "Gao checklist" (from vercel/shop PR 498, see research/raw/vercel-shop-saga.md) is the merge bar for any tool-registering code: lifecycle-safe, revalidated, bounded/redacted outputs, serialized mutations, honest ambiguity reporting, graceful degradation.

Testing: registration lifecycle unit tests (mount/abort/remount); linter tests on budget edges; generator golden tests (bistro-like HTML in, expected declarative + imperative out); manual pass in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` and the Model Context Tool Inspector extension after every milestone.

## Milestones (order, no dates)

M1 Scaffold + deploy: Next.js up on Vercel, headers verified, sandbox static with 3 hand-written tools (one readOnly, one mutating, one form/declarative). Exit: Tool Inspector lists all 3 on the prod URL.
M2 Trust layer: consent gate + receipt ledger wrapping sandbox tools. Exit: gated call shows approval UI, ledger renders and exports, readOnly bypasses.
M3 Generator core: HTML in -> proposals -> both emitters -> linter. Exit: golden tests pass.
M4 Builder loop: review/approve UI, live registration of approved tools, toolchange-driven tool list, `:tool-form-active` styling. Exit: paste -> propose -> approve -> in-page agent uses the new tool, receipt recorded.
M5 Polish: README with screenshots/GIF, export bundle (zip of generated code), hardening on hostile/empty input.
M6 Stretch: signed tool manifest + verification badge.

## Commands and environment

- `npm run dev` / `npm run build` / `npm run lint` / `npm test` (set these up in M1 and keep them green).
- Env (Vercel + `.env.local`, never committed): `MODEL_PROVIDER`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.
- Deploy: push to main deploys prod via Vercel Git integration (set up in M1). Verify headers on every first deploy of a config change.

## Writing style for docs and README in this repo

Andrew's voice: direct, no em dashes (use commas, colons, or separate sentences), no marketing adjectives, first person singular, tables over prose for comparisons, name the weakest assumption. README opens with what it is in one sentence, then a GIF, then why.

## File registry

Maintain a REGISTRY.md at repo root listing every top-level file/dir and its purpose; update it in the same commit that adds or moves files. Registry starts with: CLAUDE.md (this file), README.md, REGISTRY.md, research/, app/, lib/, tests/.
