# 01: Event Facts (OpenAI WebMCP Challenge)

Owner: Andrew Stein | Version: 1.0 | Status: Operational | Sources: openai.com/webmcp-challenge (2026-08-27), Devpost welcome email (2026-08-25)

TL;DR: Judged on usefulness, originality, execution, thoughtful WebMCP use, and human-agent experience quality. Seven judges, four of whom are the deepest WebMCP practitioners alive. Deadline September 3, 1pm PT.

## Key dates

| Date | Event |
|---|---|
| Aug 25, 12pm PT | Registration and submissions open |
| Aug 31, 11am PT | Office hours (OpenAI Discord). Attend: direct judge-adjacent signal |
| Sep 3, 1pm PT | Submission deadline |
| Sep 23 (may slip) | Winners announced |

## Judging criteria (verbatim from official FAQ)

"Projects will be evaluated on usefulness, originality, execution, thoughtful use of WebMCP, and the quality of the human-agent experience."

Working interpretation for scope allocation:
- Usefulness: solves something real, not a protocol demo
- Originality: differs from the 10-app first-party showcase pattern
- Execution: deployed, stable, works in both judge browsers
- Thoughtful use of WebMCP: uses the API surface well (hints, budgets, lifecycle, declarative where apt), not just registerTool spam
- Human-agent experience: the co-creation loop, visible state, control

## Theme (verbatim)

"Build something we haven't seen before: an app that becomes meaningfully better when people and their agents can use it together."
Email tip: "Start with the problem, not the protocol."

## Judges

| Judge | Role | What they will probe |
|---|---|---|
| Justin Rushing | Browser Agent Lead, OpenAI | ChatGPT in-app browser behavior; whether the app works with THEIR agent |
| Sarah Drasner | Distinguished Engineer, Chrome, Google | Spec-correct usage, declarative API, DevTools story |
| Jude Gao | MTS, Vercel, Next.js Core | Author of vercel/shop PR 498. Production patterns: bounded outputs, redaction, server-side revalidation, mutation safety |
| Ilya Grigorik | Distinguished Engineer, Shopify | Hydrogen webmcp.js owner. Commerce tool conventions, performance |
| Alex Nahas | Creator of MCP-B | The polyfill lineage; also built the Duckboard demo. Deep API-shape opinions |
| Andrew Galloni | VP Research and Innovation, Cloudflare | The edge-bridge worldview; retrofit and no-code angles |
| Sean Roberts | VP Applied AI, Netlify | Deployment and agent-runner story |

## Prizes

Top 10 submissions each receive: $3,000 cash (OpenAI), one year ChatGPT Pro, Codex Micro keyboard, OpenAI swag, plus sponsor prizes from Shopify, Google Chrome, Netlify, Cloudflare, Vercel, Render. Cloudflare separately advertises $10K in credits for 10 winners.

## Submission requirements (from Devpost email, verbatim structure)

1. Working live URL, accessible via ChatGPT in-app browser or Chrome 149+ with chrome://flags/#enable-webmcp-testing. Hosting: any provider (ChatGPT Sites, Cloudflare, Vercel, Render, Netlify listed). Auth allowed; credentials go on the submission form.
2. Text description answering: (a) why the use case fits WebMCP, (b) how it creates a better user experience, (c) what people and agents can do together that was difficult or impossible before, (d) how WebMCP was implemented.
3. Public YouTube demo video, under 3 minutes, with audio.
4. Public repo (GitHub/GitLab/Bitbucket): all source, assets, instructions; open source license visible in the About section; must show document.modelContext.registerTool usage.
5. Existing apps allowed ("you can also add WebMCP support to an existing app"), new apps encouraged.

## Credits to claim (Andrew action items, first-come pools)

| Sponsor | Amount | Where |
|---|---|---|
| Vercel | $30 build credits, first 1000, code OAIWEBMH-9E2F-MUT4 | credits.vercel.sh/redeem |
| Cloudflare | $20 + $10 hidden bonus | cf-for-startups-redeem.pages.dev links on webmcp-challenge.examples.workers.dev |
| Render | $50, first 500 | credits-portal-mmdm.onrender.com/claim/openai-hackathon |
| Netlify | 3000 credits, first 1000, form | forms.gle/xw75XGUQzCXEiALc7 |

Claim Vercel today (we deploy there). Others optional.
