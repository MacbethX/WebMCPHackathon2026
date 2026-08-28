/**
 * The model proxy (CLAUDE.md architecture, "/api/agent model proxy, key server-side only").
 *
 * Two jobs, and neither of them is running a tool. The model refines the prose on a
 * generated proposal, or it picks which of the page's tools matches a request and with
 * what arguments. The page carries the decision out itself through
 * `document.modelContext.executeTool`, so the consent gate and the receipt ledger stay
 * on the path. A model that could act directly would route around both.
 *
 * The key is read here and never leaves. Responses carry a written reason, never
 * upstream error text (rule 7).
 */

import { NextResponse } from "next/server";
import {
  ActRequestSchema,
  ActResponseSchema,
  AgentRequestSchema,
  RefineRequestSchema,
  RefineResponseSchema,
} from "@/lib/agent/contract";
import { ModelError, complete, readModelConfig } from "@/lib/agent/anthropic";
import type { ActRequest, AgentError, RefineRequest } from "@/lib/agent/contract";

export const runtime = "nodejs";

const REFINE_SYSTEM = `You write descriptions for WebMCP tools: short pieces of text that tell an AI agent what a tool on a web page does.

You are given a tool that was generated from a form's markup, with draft descriptions written by a program. Rewrite them in the site's own vocabulary.

Rules, all of them hard:
- The tool description is at most 400 characters. Each parameter description is at most 140 characters.
- Say what the tool DOES, in the present tense. Never start with "This tool".
- If the tool changes something, say so plainly and say what becomes visible to whom. An agent decides whether to ask a person first based on this sentence.
- Keep every constraint the draft mentions (lengths, ranges, formats). An agent cannot see the form, so a limit that is not in the description does not exist.
- Return exactly the parameters you were given, with the same names, in the same order. Never add, drop, or rename one.
- No marketing language. No "seamlessly", "easily", "simply", "powerful".
- Remove any "TODO" text and replace it with a real description.`;

const ACT_SYSTEM = `You choose which tool on a web page matches what someone asked for.

You are given the person's request and the tools the page offers, each with a JSON schema. Pick at most one tool and produce its arguments.

Rules:
- Return arguments as a JSON string that validates against the chosen tool's schema. Include every required property.
- Use only what the person actually said, plus values the schema demands. Never invent a name, a date, or a message they did not give you.
- If nothing offered fits, or you would have to make up a required value, set toolName to null and say why in one sentence. Refusing is a correct answer and is better than a wrong call.
- Prefer a read-only tool when one would answer the question.
- The reasoning field is one sentence, addressed to the person, saying what you are about to do and why.`;

function bad(reason: string, status = 400, configuration = false) {
  const body: AgentError = configuration ? { ok: false, reason, configuration } : { ok: false, reason };
  return NextResponse.json(body, { status });
}

async function refine(request: RefineRequest) {
  const params = request.params
    .map(
      (param) =>
        `- ${param.name} (${param.type}${param.required ? ", required" : ", optional"})` +
        `${param.constraints ? `, constraints: ${param.constraints}` : ""}\n  draft: ${param.draftDescription}`,
    )
    .join("\n");

  const user = [
    `Tool name: ${request.toolName}`,
    `This tool ${request.mutating ? "CHANGES data" : "only reads data and changes nothing"}.`,
    `Draft tool description: ${request.draftDescription}`,
    "",
    "Parameters:",
    params || "(none)",
    request.context ? `\nText from the page, for vocabulary:\n${request.context}` : "",
  ].join("\n");

  return complete({ system: REFINE_SYSTEM, user, schema: RefineResponseSchema });
}

async function act(request: ActRequest) {
  const tools = request.tools
    .map(
      (tool) =>
        `Tool: ${tool.name}${tool.readOnly ? " (read-only)" : " (changes data)"}\n` +
        `Description: ${tool.description}\n` +
        `Schema: ${JSON.stringify(tool.inputSchema ?? { type: "object", properties: {} })}`,
    )
    .join("\n\n");

  const user = [
    `The person asked: ${request.request}`,
    "",
    "Tools this page offers:",
    tools || "(the page offers no tools)",
  ].join("\n");

  return complete({ system: ACT_SYSTEM, user, schema: ActResponseSchema });
}

export async function POST(httpRequest: Request) {
  let body: unknown;
  try {
    body = await httpRequest.json();
  } catch {
    return bad("The request body was not valid JSON.");
  }

  const parsed = AgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return bad("The request did not match what this endpoint accepts.");
  }

  try {
    const data =
      parsed.data.kind === "refine"
        ? await refine(RefineRequestSchema.parse(parsed.data))
        : await act(ActRequestSchema.parse(parsed.data));

    return NextResponse.json({ ok: true, data });
  } catch (cause) {
    if (cause instanceof ModelError) {
      // A missing key is the operator's problem, not a server fault, and it is the one
      // case where the person on the page can be told exactly what to do about it.
      return bad(cause.message, cause.configuration ? 503 : 502, cause.configuration);
    }
    return bad("The request could not be completed.", 500);
  }
}

/** Whether the proxy is usable, so the UI can say so before anyone tries. */
export async function GET() {
  const config = readModelConfig();
  return NextResponse.json({ model: config.model, configured: config.apiKey !== null });
}
