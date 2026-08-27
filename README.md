# Toolsmith

Toolsmith is where you and an AI agent make your website agent-ready, together.

[GIF placeholder: paste HTML -> agent proposes tools -> approve -> agent uses the tool it just wrote -> receipt appears]

## Why

Two things bug me about WebMCP, the proposed standard that lets websites expose structured tools to AI agents. The spec's own issue tracker admits user consent isn't figured out yet ([#165](https://github.com/webmachinelearning/webmcp/issues/165), [#176](https://github.com/webmachinelearning/webmcp/issues/176)), and every demo assumes a developer sitting there writing tools by hand. Most of the web doesn't have that developer.

I've seen this problem shape before. When Splunk upgraded its entire web stack, thousands of ecosystem apps needed to move, and most had no engineering team waiting around to do it. The answer wasn't documentation, it was tooling that did the heavy lifting. Toolsmith is named for that idea.

And one idea I couldn't shake: if an agent can call tools, it should be able to help make them. Toolsmith is an agent using WebMCP tools to write WebMCP tools, with a human approving every step.

## What it does

1. Paste your site's HTML. An in-page agent proposes WebMCP tools for it.
2. You edit and approve each proposal.
3. Approved tools become real code: declarative form annotations (`toolname`, `tooldescription`, `toolparamdescription`) where a form fits, `document.modelContext.registerTool` with strict schemas and annotations everywhere else.
4. The tools register live in a sandbox site immediately, so the same agent that wrote them uses them in front of you. Or bring your own: it works with any WebMCP-capable browser agent (Chrome 149+ behind `chrome://flags/#enable-webmcp-testing`, or agents that support the API natively).
5. Every state-changing call passes a consent gate. Every call lands in a signed, human-readable receipt ledger you can export.

Consent and audit aren't in the platform yet, so Toolsmith ships them at the app layer, where they work with any agent that calls the tools.

## Design decisions that came from evidence, not vibes

- I tested Chrome's declarative schema synthesis before writing the generator (see `research/raw/spike-2-chrome-declarative-synthesis.md`). Selects synthesize into dual anyOf/enum shapes and `required` mirrors the form, but validation limits end up as prose and forms can't carry a `readOnlyHint` at all. That decided the routing rule: declarative for forms, imperative whenever hints or strict validation matter.
- I read the vercel/shop WebMCP PR before writing a line: bounded outputs, redacted results, server-side revalidation, mutations reported unsafe-to-retry on ambiguity. Stolen wholesale (`research/raw/vercel-shop-saga.md`).
- Chrome's published character budgets (30/500/150/1500) are enforced by a linter on everything the generator emits, because a 900-character tool description is a bug.

## Status

Active build. Milestones in `CLAUDE.md`. The `research/` folder is the full pre-build research pack, kept as-is for provenance.

Built with Claude Code. Started for the OpenAI WebMCP Challenge; I was disqualified on an employer conflict-of-interest rule before submitting, and decided the thing was worth building anyway.

## License

MIT
