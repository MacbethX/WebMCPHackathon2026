# WebMCP Challenge Research Pack: Index

Owner: Andrew Stein | Version: 1.0 | Status: Operational | Date: 2026-08-27

TL;DR: Everything needed to start the build is captured. Decision required: confirm the builder-plus-trust concept against the now-known judging criteria and judge roster, then commit PLAN.md.

## Files in this pack

| File | Contents |
|---|---|
| 00_INDEX.md | This file. Source inventory and read status |
| 01_event.md | Rules, dates, judging criteria, judges, prizes, credits to claim |
| 02_spec_api.md | Imperative API, declarative API, security guidance, character budgets, deployment constraints |
| 03_ecosystem.md | Cloudflare, Vercel, Shopify, Netlify, Render, OpenAI showcase field analysis |
| 04_build_implications.md | Positioning, judge map, patterns to adopt, risks, open spikes |
| spec-declarative-api-explainer.md | Raw copy of the W3C declarative API explainer (source of truth for form attributes) |
| use-webmcp-tool-README.md | Raw copy of Chrome's React hook readme (registration lifecycle pattern) |
| raw/ | Raw extracts of every source read (Cloudflare blog, OpenAI challenge page, Devpost email, Chrome docs, ChatGPT Sites, Shopify tools, Vercel PR saga, showcase field, naming drift note) plus actual source code: ChromeLabs demos (pizza-maker imperative, french-bistro declarative) and the Cloudflare webmcp-react starter (App.tsx, useWebMCPTools.ts). raw/sponsor-resources-not-fetched.md lists deliberate gaps with reasons |

## Source inventory and status

| Source | Status | Value |
|---|---|---|
| openai.com/webmcp-challenge | Read | Judging criteria, judges, prizes, dates. Highest-value single source |
| Devpost email (uploaded PDF + Gmail original) | Read | Submission requirements verbatim |
| webmachinelearning/webmcp README (spec explainer) | Read | Full imperative API, getTools/executeTool, exposedTo, permissions policy, open questions |
| Declarative API explainer (raw md, saved) | Read | toolname/tooldescription/toolautosubmit, respondWith, pseudo-classes, events |
| developer.chrome.com/docs/ai/webmcp | Read | Origin trial, flag, origin isolation requirement, demos, Tool Inspector |
| Chrome secure-tools doc | Read | readOnlyHint, untrustedContentHint, exposedTo guidance, character budgets |
| Chrome origin trial blog | Read | Nothing beyond OT registration |
| blog.cloudflare.com/webmcp | Read | Edge-injected bridge, tool packs, competitive implications |
| Cloudflare challenge landing (workers.dev) | Read | $20+$10 credits, React starter, $10K sponsor prize, link to official page |
| vercel/shop PR 498 + aftermath (500, 501, 504) | Read | Production implementation patterns, then revert to Shopify Hydrogen webmcp.js |
| use-webmcp-tool npm readme (saved) | Read | Chrome-maintained React hook, lifecycle binding |
| OpenAI showcase (webmcp-apps filter) | Read | 10 first-party examples, competitive field pattern |
| learn.chatgpt.com Sites doc | Read | ChatGPT Sites hosting evaluated, rejected for this build |
| Shopify shopify.dev/docs/api/web-mcp | Not read | Day-1 reading. Hydrogen webmcp.js tool naming conventions |
| Chrome evals doc, DevTools WebMCP panel doc | Not read | Day-1 reading. Testing and debugging workflow |
| GoogleChromeLabs/webmcp-tools demos | Not read | Day-1 reference implementations (pizza-maker, react-flightsearch, french-bistro) |
| cloudflare/agents webmcp-react starter | Not read | Reference only; we deploy on Vercel |
| Netlify webmcp-starter, Render workflows | Not read | Not on critical path |
| Devpost rules page (webmcp.devpost.com) | Blocked (bot detection) | Andrew: print-to-PDF the rules page for the AI policy and original-work window |

## Remaining unknowns

1. Devpost fine-print rules: AI-assistance disclosure, original-work window, IP terms. Low build risk, needed before submission text is final.
2. ChatGPT in-app browser behavior with tools: discovery timing, confirmation UX, navigation. Day-1 spike, not researchable from documents.
