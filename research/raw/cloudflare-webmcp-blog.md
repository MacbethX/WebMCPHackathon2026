# Cloudflare WebMCP blog (raw extract, blog.cloudflare.com/webmcp, published 2026-08-06, captured 2026-08-27)

Developer preview: one dashboard switch (Agent Readiness > WebMCP) makes any Cloudflare-proxied site usable by browser agents, no code, no origin changes.

Mechanics:
- HTMLRewriter injects at the edge into every HTML response: <script type="module" src="/.webmcp/bridge.js" data-packs="c2pa,mcp-server-client" data-mcp-url="/mcp"></script>. Same origin, served by an edge worker.
- Bridge feature-detects document.modelContext; no-ops if absent.
- Tool "packs": Content Credentials (scan_images_c2pa sweeps images for C2PA manifests; inspect_image_c2pa decodes one; DECODE ONLY, always signatureVerified:false) and Site MCP Server (fetches your existing MCP server's tools/list, registers a proxy per tool whose execute() POSTs a JSON-RPC tools/call back to same-origin /mcp with credentials:"same-origin", returns the CallToolResult straight through).
- Everything runs in visitor's browser this preview; future packs may call edge workers (Workers AI, AI Search).
- Uses MCP's own Tool and CallToolResult types verbatim: "The browser is just another place MCP runs."
- BrowserRun (CF remote browser) consumes WebMCP tools; Radar will expose its own tools.
- Claim in post: WebMCP "shipping experimentally in Chrome 146" (see naming-note.md; Chrome docs say OT from 149).

Registration proxy pattern (verbatim shape):
document.modelContext.registerTool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, execute: async (args) => { const res = await fetch(mcpUrl, { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0", id:1, method:"tools/call", params:{name: tool.name, arguments: args}})}); const { result } = await res.json(); return result; }});

Competitive read for us: retrofit-as-switch exists for Cloudflare-proxied sites, but only generic packs or proxying an EXISTING MCP server. No first-party tool authorship, no consent/receipt layer, C2PA unverified. Complementary framing available: we author, they distribute.
