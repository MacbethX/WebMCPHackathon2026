# Shopify WebMCP tools (raw extract, shopify.dev/docs/api/web-mcp, captured 2026-08-27)

Shopify provides WebMCP tools on EVERY Liquid storefront and Hydrogen developer-preview storefronts. Zero install. Tools act on the shopper's live session; cart tools call Shopify.actions (same functions apps use), so agent cart changes behave like the shopper's own and trigger theme behavior (e.g. cart drawer). Everything visible in the shopper's tab. Agent support currently limited to Chromium-based browsers.

## Tool inventory (10 tools, naming conventions)
Catalog: search_catalog, browse_store, get_product, show_variant
Cart: get_cart, update_cart, cancel_cart
Checkout/orders: proceed_to_checkout, manage_orders
Store info: search_shop_policies_and_faqs

## Patterns worth stealing
- Ambiguity handling: update_cart "If a request is ambiguous, then the tool returns options to clarify without changing the cart." Mutation refuses on ambiguity, returns choices.
- Navigation as a tool: show_variant / proceed_to_checkout TAKE THE SHOPPER to the page (agent action = shared visible navigation).
- proceed_to_checkout verifies cart isn't empty before navigating (precondition checks in tool).
- manage_orders: asks shopper to log in first if unauthenticated (auth boundary respected inside tool).
- Verb_noun snake_case names, all within 30-char budget.
- Distinct from backend Storefront MCP (their server-side MCP): WebMCP = shopper's browser agent, Storefront MCP = your own agent. Keep this distinction straight in submission text; judge Grigorik owns both.
