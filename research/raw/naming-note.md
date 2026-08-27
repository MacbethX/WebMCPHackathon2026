# API naming drift note (captured 2026-08-27)
- Current spec + Chrome + hackathon email: document.modelContext.
- Older ecosystem code (early 2026, e.g. mcp-fe changelog Feb 2026, early MCP-B/@mcp-b lineage) used navigator.modelContext.
- Cloudflare blog (Aug 6) says "shipping experimentally in Chrome 146"; Chrome docs say origin trial from Chrome 149 + enable-webmcp-testing flag. Treat Chrome docs as authoritative.
- Implication for the builder: generated code must target document.modelContext and feature-detect; if we ship a compat shim, alias navigator.modelContext only as read fallback, never as primary.
