# Vercel shop WebMCP saga (raw extract, github.com/vercel/shop PRs 498/500/501/504, captured 2026-08-27)

PR 498 "Add experimental WebMCP storefront tools" (author gaojude = judge Jude Gao; merged Aug 10 by laugharn):
What: progressively register FOUR storefront tools via native document.modelContext (product search, product options, guest-cart reads, explicit add-to-cart). Documents Chrome testing flag, Tool Inspector, Chrome DevTools MCP, optional origin-trial setup.
Implementation notes (verbatim from PR body, this is the Gao checklist):
- one null-rendering Client Component with direct registerTool calls and AbortSignal cleanup
- validates tool arguments AGAIN in Server Actions; resolves exact, available, non-bundle variants before mutation
- cart writes stay on existing /api/cart path incl. BotID checks; serializes browser cart writes
- returns reduced, bounded tool results WITHOUT cart IDs, checkout URLs, payment data, customer data, or upstream error text
- reports ambiguous mutation outcomes as unsafe to retry
- unsupported browsers keep the normal storefront
Testing included a native Chrome lifecycle smoke: 4 tools registered, abort removed them, remount re-registered without duplicates.

Aftermath:
- PR 500 (adopt Chrome's use-webmcp-tool hook): CLOSED, not merged.
- PR 501 revert proposal; PR 504 (merged Aug 14): reverts the hand-rolled implementation entirely, replaces with Shopify HYDROGEN's webmcp.js loaded via ShopifyScripts behind webmcp.isEnabled config flag, gated on document.modelContext presence. Commit message: framework-provided implementation preferred over hand-rolled for commerce.
- Hydrogen maintainer (frandiox) comment on 498: "Hydrogen already adds WebMCP tools via <ShopifyScripts>."

Lessons: (1) judge-authored production checklist above; meet every line; (2) hand-rolled commerce toolsets are solved/low-originality; (3) live preview deploys existed at shop-template-git-codex-webmcp.labs.vercel.dev.
