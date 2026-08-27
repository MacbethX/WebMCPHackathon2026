# 03: Ecosystem and Competitive Field

Owner: Andrew Stein | Version: 1.0 | Status: Operational | Sources: Cloudflare blog 2026-08-06, vercel/shop PRs 498/500/501/504, OpenAI showcase, sponsor resource list (read 2026-08-27)

TL;DR: The platforms have already shipped the naive versions of two of our three original ideas. That kills "retrofit as product" but validates the space and sharpens the wedge: first-party tool authorship with a trust surface, which nobody ships.

## Cloudflare: edge-injected WebMCP bridge (developer preview, Aug 6)

- One dashboard switch; HTMLRewriter injects /.webmcp/bridge.js (same origin) into every HTML response. No origin code changes.
- Tool "packs": Content Credentials (C2PA image metadata scan/inspect, decode only, signatureVerified:false always) and Site MCP Server (proxies an existing backend MCP server's tools/list into document.modelContext, calls back same-origin /mcp with the visitor's session).
- Everything runs in the visitor's browser; future packs may call edge workers (Workers AI, AI Search).
- BrowserRun (their remote browser) consumes WebMCP tools; Radar will expose its own tools.
- Competitive read: this is "no-code agent-ready" for sites already behind Cloudflare, but it only proxies generic packs or an EXISTING MCP server. It does not author site-specific first-party tools, and it has no consent/receipt layer. Judge Galloni (Cloudflare) will recognize instantly whether we understand this distinction. Position as complementary: we author the tools a site actually needs; their bridge distributes.

## Vercel: shop template saga (the single best implementation case study)

- PR 498 (merged Aug 10, author Jude Gao, NOW A JUDGE): four storefront tools via native document.modelContext in one null-rendering client component. Production patterns stated in the PR body:
  - AbortSignal cleanup; remount-safe (no duplicate registrations)
  - Re-validate all tool arguments in Server Actions; resolve exact available variants before mutation
  - Keep writes on existing API paths (BotID checks intact); serialize concurrent cart writes
  - Return reduced, BOUNDED tool results; redact cart IDs, checkout URLs, payment/customer data, upstream error text
  - Report ambiguous mutation outcomes as unsafe to retry
  - Tools: product search, product options, guest-cart read, explicit add-to-cart
- PR 500 (use-webmcp-tool hook adoption): closed, not merged.
- PR 501/504 (Aug 14): hand-rolled implementation REVERTED, replaced by Shopify Hydrogen's webmcp.js loaded via ShopifyScripts behind a webmcp.isEnabled config flag, gated on document.modelContext presence.
- Lessons: (1) the judge who will grade our implementation wrote the checklist above; meet every item; (2) even Vercel chose the platform-provided implementation over hand-rolled for commerce, so a hand-rolled COMMERCE tool set is a solved problem and low-originality; (3) Shopify webmcp.js is the de facto commerce reference.

## Shopify

- shopify.dev/docs/api/web-mcp: WebMCP tools for storefronts (Hydrogen ships them via ShopifyScripts). Judge Grigorik owns this space. Day-1 skim for tool naming conventions only; do not compete on commerce tools.
- shopify.dev/docs/agents: Catalog API and agent tooling.

## Netlify and Render

- Netlify: webmcp-starter.netlify.app is a copy-a-prompt starter using Agent Runners. Judge Sean Roberts. Not our host; note existence.
- Render: Workflows product pitched for agent-ready backends. Not needed for a page-side build.

## OpenAI first-party field (what "already seen" looks like)

Showcase (webmcp-apps): 3D modeling studio, Margin (collaborative writing with agent identity/comments), Crossword Desk, Fieldwork beat machine, WanderNote itinerary, Webroom photo editing, Sunday Table meal planning, Cubecade puzzle, Paperie cards, Verdant Market grocery cart. Challenge page adds Duckboard (DuckDB-Wasm data exploration, by judge Alex Nahas).
- Pattern: consumer co-creation canvas, one domain each. Hosted on *.openai.chatgpt.site with chatgpt.com/codex/deeplink links.
- Prediction: the median community submission clones this pattern. Originality criterion punishes clones.
- White space confirmed: nothing meta (tools that make tools), nothing trust-forward (consent, receipts, audit), nothing that treats the WebMCP developer as the user.

## Chrome ecosystem extras

- use-webmcp-tool (Chrome-maintained React hook): mount/unmount lifecycle binding, feature detection, annotations support. Use it or match its lifecycle behavior.
- Angular has native WebMCP support (angular.dev/ai/webmcp). Irrelevant to us; shows framework momentum.
- Modern Web Guidance repo (GoogleChrome/modern-web-guidance) includes a WebMCP skill for coding agents. Pull into the Claude Code build workflow on day 1.
