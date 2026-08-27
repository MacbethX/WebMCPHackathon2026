# 04: Build Implications

Owner: Andrew Stein | Version: 1.0 | Status: Pending (decision required) | Date: 2026-08-27

TL;DR: Decision required from Andrew: confirm the concept below so PLAN.md can be committed today. 7 days remain.

## Concept under evaluation (carried from chat, updated by this research)

Working name: the builder. A web app where a human and an agent together make a website agent-ready:
1. Human pastes site HTML or describes their site; agent (in-page, GPT-5.6 via Responses API) proposes tools.
2. Builder emits declarative annotations (toolname/tooldescription/toolautosubmit) and imperative registerTool stubs, budget-linted and hint-annotated (readOnlyHint, untrustedContentHint).
3. Live preview sandbox registers generated tools immediately; the judge's ChatGPT can use the site it just helped create. Builder's own tools are also WebMCP tools (the meta loop).
4. Trust surface throughout: consent gates on state-changing tools, live signed receipt ledger of every agent action, verified manifest badge (stretch).

## Judging criteria map

| Criterion | How the builder scores |
|---|---|
| Usefulness | Real problem: the long tail of the web has no dev budget for agent readiness. Output is copy-paste deployable |
| Originality | Only meta entry in a field of co-creation canvases; trust surface nobody ships |
| Execution | Meet the Gao checklist (below); works in both judge browsers; zero-setup live URL |
| Thoughtful WebMCP use | Both APIs; budgets enforced as a linter; hints; lifecycle correctness; pseudo-class styling; toolchange-driven UI |
| Human-agent experience | Human edits, agent proposes, every action visible, vetoable, receipted |

## The Gao checklist (from PR 498; the judge wrote it, meet every line)

- Null-rendering registration component or equivalent; AbortSignal cleanup; remount-safe, no duplicate registrations
- Re-validate every tool argument server-side (or in the sandbox boundary) before mutation
- Bounded, reduced tool outputs; redact secrets/IDs/URLs that grant capability; never pass through raw upstream errors
- Serialize concurrent mutations; report ambiguous outcomes as unsafe to retry
- Feature-detect; unsupported browsers get the normal site

## Positioning corrections forced by research

1. Cloudflare ships one-switch retrofit. Do not pitch "make any site agent-ready" as novel infrastructure. Pitch first-party tool AUTHORSHIP plus trust: their bridge proxies generic packs; we generate the site-specific tools with the safety properties the platform lacks.
2. Commerce tool sets are solved (Shopify webmcp.js, adopted even by Vercel). The demo sandbox can be storefront-FLAVORED for visual recognition, but our tools must not read as a worse Hydrogen clone. Keep the sandbox small and generic (e.g., a booking or catalog toy), spotlight the builder.
3. Consent is the platform's admitted open question (spec issues #165/#50). Building it app-side is standards-relevant, and three judges (Drasner, Nahas, Rushing) sit close to that debate. Say so in the submission text with issue links.

## Day-1 spikes (unchanged, sharpened)

| # | Spike | Kill signal |
|---|---|---|
| 1 | ChatGPT in-app browser on a deployed page: tool discovery timing, invocation, confirmation UX, behavior across SPA route changes | Tools not discovered or never invoked |
| 2 | Declarative form on same page: inspect the synthesized inputSchema in the flag browser and Tool Inspector | Schema synthesis too broken to generate against |
| 3 | Vercel deploy headers: origin isolation intact, no OAC ?0, permissions policy clean | registerTool rejects NotAllowedError |

## Risks

| Risk | Mitigation |
|---|---|
| ChatGPT browser confirmation UX duplicates or fights our consent gates | Spike 1; if the host confirms natively, our gates demote to receipts plus readOnlyHint correctness |
| Declarative schema synthesis instability (explicitly TBD in spec) | Generate imperative-first; declarative as showcase |
| 7 days, solo | Stretch goals (signed manifest, Sites mirror) are cut lines, not commitments |
| Devpost fine print unread (AI policy, original-work window) | Repo starts empty today; Andrew uploads rules PDF before submission text finalizes |

## Immediate Andrew actions

1. Claim Vercel $30 (code OAIWEBMH-9E2F-MUT4) today; pools are first-come.
2. Print-to-PDF the Devpost rules page and upload.
3. Calendar hold: office hours Aug 31, 11am PT, OpenAI Discord.
4. Say go: PLAN.md gets written and the repo starts.

## Deployment state (updated 2026-08-27)

- Vercel team ID: team_6TcRo2z2yVUK9Xq6stOFpBUE (credits applied here; deploy target for the project)
- Netlify account ID: 6a905943753d554753a5f830 (credits form pending until approved; backup host only, Vercel remains primary)
- Repo: github.com/MacbethX/WebMCPHackathon2026 (created 2026-08-27; MIT license must be visible in About before submission; first commit = research/ + PLAN.md for the timestamped new-work evidence)
- Eligibility decision (2026-08-27): Andrew proceeds and will submit; accepts disqualification-at-verification as the downside. Google IP: cleared by Andrew. No clarification email.
- Name provenance (2026-08-27): "Toolsmith" named by Andrew after the Splunk web-stack upgrade effort that built tooling to help ~10,000 ecosystem apps migrate quickly. Use in Inspiration section; neutralizes Devpost's AI-naming warning; converts Impact claim to track record. Resolved: state "thousands of apps" publicly, not 10,000. No internal name used.
- STATUS CHANGE (2026-08-27): Disqualified from the hackathon by email (employer conflict). Project continues as a public portfolio build in MacbethX/WebMCPHackathon2026. All Devpost/submission/video overhead dropped; quality bar and architecture retained; no deadline.
