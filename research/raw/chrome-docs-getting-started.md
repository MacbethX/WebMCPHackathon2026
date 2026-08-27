# Chrome WebMCP docs, getting started + secure-tools (raw extract, developer.chrome.com/docs/ai/webmcp and /secure-tools, captured 2026-08-27)

Getting started (published 2026-05-18, updated 2026-08-07):
- Two APIs: imperative (JS tools) and declarative (annotated forms). Angular has experimental native support.
- Origin trial from Chrome 149 (register trial id 4163014905550602241); local flag chrome://flags/#enable-webmcp-testing.
- ORIGIN ISOLATION REQUIRED: WebMCP only in origin-isolated documents; Origin-Agent-Cluster: ?0 (document.domain) disables the APIs.
- Permissions policy "tools" defaults to self; cross-origin iframes need allow="tools".
- Limitations: not for headless; complex interfaces may need refactoring; discoverability requires visiting the site.
- Demos: pizza-maker (imperative), react-flightsearch (imperative), french-bistro (declarative), all in GoogleChromeLabs/webmcp-tools; appointment-booking comparison demo at googlechromelabs.github.io/webmcp-tools/demos/explainer/#compare.
- Model Context Tool Inspector extension (Chrome Web Store id gbpdfapgefenggkahomfgkhfehlcenpd): view registered tools, call manually, validate schemas, chat via gemini-3-flash-preview.

Secure-tools (published 2026-06-09, updated 2026-07-01):
- Prompt injection framing: LLMs probabilistic, safety inside the model cannot be guaranteed; repeatable attacks documented. Never claim deterministic prevention.
- untrustedContentHint on tools returning UGC/external data. readOnlyHint on non-mutating tools (better confirmation decisions).
- exposedTo: only trusted secure origins; read-only tools can leak user data; write tools act on the user's behalf.
- Chrome extensions with host_permission can run/execute WebMCP tools via content scripts regardless.
- Character budgets (may change): 500/tool description, 150/param description, 30/tool+param name, 1.5K/tool output.
- requestUserInteraction() in spec draft (ModelContextClient) for user input at tool execution; consent management discussion ongoing (spec issue #176).
- NOT YET CAPTURED RAW (fetch-blocked; read in Chrome day 1): /webmcp/imperative-api, /webmcp/declarative-api, /webmcp/evals, /docs/devtools/application/webmcp.
