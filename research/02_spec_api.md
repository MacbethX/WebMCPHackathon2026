# 02: WebMCP API and Spec Facts

Owner: Andrew Stein | Version: 1.0 | Status: Operational | Sources: webmachinelearning/webmcp README + declarative explainer (saved in this pack), developer.chrome.com WebMCP docs and secure-tools (read 2026-08-27)

TL;DR: Build against document.modelContext with AbortController lifecycle, ship both imperative and declarative tools, enforce the character budgets, and treat consent as an app-level feature because the platform has not settled it.

## Imperative API (stable enough to build on)

```js
const controller = new AbortController();
await document.modelContext.registerTool({
  name: "add-todo",                       // <=30 chars per Chrome budget
  description: "...",                     // <=500 chars
  inputSchema: { type: "object", properties: {...}, required: [...] },
  async execute(input) {
    return { content: [{ type: "text", text: "..." }] };   // <=1.5K chars output
  }
}, { signal: controller.signal });
// controller.abort() unregisters.
```

- Tool result shape is MCP CallToolResult: { content: [{type:"text", text}] }.
- Dynamic tools: register/unregister as UI state changes; document.modelContext fires "toolchange".
- In-page (author-provided) agents are first-class: getTools() to discover, executeTool(tool, args, {signal}) to invoke; browser mediates; runs in tool owner's context. Cross-origin discovery requires fromOrigins listing secure origins; exposure requires the registering side to set exposedTo.
- Execution cancellation: executeTool accepts AbortSignal; execute callback receives options.signal.
- TypeScript types: npm webmcp-types. React lifecycle wrapper: npm use-webmcp-tool (Chrome-maintained, feature-detects, no-ops when API absent; registers on mount, unregisters on unmount; supports annotations with readOnlyHint/untrustedContentHint).

## Declarative API (forms)

Attributes on <form>: toolname, tooldescription, toolautosubmit (boolean; lets agent submit without user checking).
- Browser synthesizes inputSchema from form-associated elements. Exact reduction algorithm TBD; Chromium ships a loose version. Verify actual synthesized schemas in the flag browser on day 1.
- Response paths: SubmitEvent.respondWith(promise) (preventDefault first; no navigation) or, cross-document, JSON-LD script extraction (contested, issue #135).
- SubmitEvent.agentInvoked boolean distinguishes agent submissions.
- Events on ModelContext: toolactivated (form filled, pre-submit; hook for highlighting), toolcanceled (agent aborted). Whether these fire for imperative calls is a Chromium behavior, not spec-settled.
- CSS pseudo-classes: :tool-form-active on the running form, :tool-submit-active on its submit button. Free UI polish: style these for the "agent is filling this" glow.
- Form reset or toolname/tooldescription mutation cancels in-flight invocations.

## Security guidance (Chrome secure-tools)

- readOnlyHint on non-mutating tools: lets agents skip confirmation appropriately.
- untrustedContentHint on tools returning UGC/external data.
- exposedTo only to trusted secure origins; default is same-origin plus built-in agents.
- Character budgets (subject to change, treat as lint rules): 500 tool description, 150 param description, 30 tool/param name, 1500 tool output.
- Honest security posture: LLMs are probabilistic; prompt injection cannot be guaranteed away. Mitigations reduce surface; human confirmation gates consequential actions. Never claim deterministic prevention.

## Consent: NOT platform-settled

- requestUserInteraction() exists only in the spec draft (ModelContextClient); user prompting/elicitation is open (issues #165, #50).
- Implication: consent gates, receipts, and confirmation UI must live in our execute wrappers. Works with any agent; platform gap becomes our feature.

## Deployment constraints

- WebMCP requires origin-isolated documents. Origin-Agent-Cluster: ?0 (document.domain) DISABLES it. Verify response headers on Vercel; do not set OAC ?0.
- Permissions policy "tools" defaults to self. Cross-origin iframes need allow="tools"; Permissions-Policy: tools=() header disables. registerTool rejects with NotAllowedError when disabled.
- Judge paths: ChatGPT in-app browser (native support) or Chrome 149+ flag chrome://flags/#enable-webmcp-testing. Origin trial token available (Chrome 149 OT) for flag-free Chrome visitors; register the deployed origin.
- Cloudflare's blog says "shipping experimentally in Chrome 146"; Chrome's own docs say origin trial from 149 and local flag. Trust Chrome's docs; the discrepancy is likely initial prototype vs OT milestone. Test on current stable.

## Testing and debugging

- Model Context Tool Inspector extension (Chrome Web Store): see registered tools, call them manually, validate schemas, chat against gemini-3-flash-preview.
- Chrome DevTools has a WebMCP panel (developer.chrome.com/docs/devtools/application/webmcp). Day-1 reading.
- WebMCP evals doc exists (developer.chrome.com/docs/ai/webmcp/evals). Candidate for a repo evals/ folder; judges from Chrome wrote this content.
- Reference demos: GoogleChromeLabs/webmcp-tools (pizza-maker imperative, react-flightsearch imperative, french-bistro declarative) plus appointment-booking comparison demo.
