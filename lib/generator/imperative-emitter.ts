/**
 * Imperative emitter: a registration module, and a schema that beats the browser's.
 *
 * CLAUDE.md sets the bar as exceeding Chrome's synthesis quality. Concretely, against
 * the same form, this emitter produces:
 *
 * | Chrome synthesizes | This emits |
 * |---|---|
 * | Everything typed `string` | `number` and `boolean` where the control says so |
 * | Length and range limits as prose, if at all | `minLength`, `maxLength`, `minimum`, `maximum` |
 * | A regex in `format` for time inputs | The regex in `pattern`, where a regex belongs |
 * | `anyOf` of const/title branches *and* a flat `enum` | One of the two, whichever fits |
 * | No annotations, ever | `readOnlyHint` and `untrustedContentHint` |
 *
 * The emitted code also carries the two things a real Chrome taught us the hard way:
 * feature detection, and a fallback for `execute` being called with no `options`
 * (spike 5). Code that reads `options.signal` directly throws in the current Chrome, so
 * emitting it would be shipping a known bug into other people's sites.
 *
 * Output is a standalone TypeScript module with no imports and no framework, because
 * the person pasting it has a site we know nothing about.
 */

import { BUDGETS } from "../webmcp/budgets";
import { emptyRecord } from "../webmcp/records";
import { requiresConsentGate } from "./consent-design";
import { CHROME_TIME_FORMAT } from "./declarative-emitter";
import type { AnalyzedControl } from "./analyzed";
import type { JsonSchemaObject, JsonSchemaProperty } from "../webmcp/types";
import type { ToolProposal } from "./proposal";

export interface ImperativeEmission {
  /** A standalone TypeScript module. */
  code: string;
  /** The schema that code registers. */
  schema: JsonSchemaObject;
}

/** True when every option's label says nothing its value does not already say. */
function labelsAreRedundant(control: AnalyzedControl): boolean {
  return (control.options ?? []).every((option) => option.label === option.value);
}

/** One control's property, done properly rather than the way the browser does it. */
export function toSchemaProperty(
  control: AnalyzedControl,
  description: string,
): JsonSchemaProperty {
  const property: JsonSchemaProperty = { type: "string", description };

  // Checkbox arity decides before anything else. Grouping gives even a lone checkbox
  // one option, and reading that as an enum turns a yes/no into a one-element string
  // choice, which is a worse schema than the form it came from.
  if (control.type === "checkbox") {
    if ((control.options?.length ?? 0) > 1) {
      // Several checkboxes under one name submit several values.
      property.type = "array";
      property.enum = control.options!.map((option) => option.value);
    } else {
      property.type = "boolean";
    }
    return property;
  }

  if (control.options && control.options.length > 0) {
    if (labelsAreRedundant(control)) {
      property.enum = control.options.map((option) => option.value);
    } else {
      // `oneOf` with const and title is the idiomatic way to carry a label. Chrome's
      // anyOf-plus-enum says the same thing twice.
      property.oneOf = control.options.map((option) => ({
        const: option.value,
        title: option.label,
      }));
    }
    return property;
  }

  switch (control.type) {
    case "number":
    case "range": {
      property.type = "number";
      const min = Number(control.min);
      const max = Number(control.max);
      if (control.min !== undefined && Number.isFinite(min)) property.minimum = min;
      if (control.max !== undefined && Number.isFinite(max)) property.maximum = max;
      return property;
    }

    case "date":
      property.format = "date";
      break;

    case "email":
      property.format = "email";
      break;

    case "url":
      property.format = "uri";
      break;

    case "time":
      // A regex belongs in `pattern`. Chrome puts it in `format`, which means something
      // else entirely. Same expression, correct home.
      property.pattern = CHROME_TIME_FORMAT;
      break;

    default:
      break;
  }

  if (control.pattern !== undefined) property.pattern = control.pattern;
  if (control.minLength !== undefined) property.minLength = control.minLength;
  if (control.maxLength !== undefined) property.maxLength = control.maxLength;

  return property;
}

export function buildSchema(proposal: ToolProposal): JsonSchemaObject {
  const properties = emptyRecord<JsonSchemaProperty>();
  const required: string[] = [];

  for (const param of proposal.params) {
    properties[param.name] = toSchemaProperty(param.control, param.description);
    if (param.required) required.push(param.name);
  }

  return { type: "object", properties, required, additionalProperties: false };
}

const indent = (text: string, spaces: number): string =>
  text
    .split("\n")
    .map((line) => (line.length > 0 ? `${" ".repeat(spaces)}${line}` : line))
    .join("\n");

/** JSON with stable key order, indented to sit where it is spliced into the module. */
function renderSchema(schema: JsonSchemaObject): string {
  return indent(JSON.stringify(schema, null, 2), 6).trimStart();
}

/** Quotes a property name only when it is not a plain identifier. */
function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function tsTypeFor(property: JsonSchemaProperty): string {
  if (property.type === "number") return "number";
  if (property.type === "boolean") return "boolean";
  if (property.type === "array") return "string[]";
  if (property.enum) return property.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (property.oneOf) return property.oneOf.map((entry) => JSON.stringify(entry.const)).join(" | ");
  return "string";
}

function renderArgsType(proposal: ToolProposal, schema: JsonSchemaObject): string {
  if (proposal.params.length === 0) return "Record<string, never>";

  const fields = proposal.params.map((param) => {
    const property = schema.properties?.[param.name];
    const optional = param.required ? "" : "?";
    return `  ${propertyKey(param.name)}${optional}: ${tsTypeFor(property ?? {})};`;
  });

  return `{\n${fields.join("\n")}\n}`;
}

function renderAnnotations(proposal: ToolProposal): string {
  const entries = Object.entries(proposal.annotations).filter(([, value]) => value === true);
  if (entries.length === 0) return "";
  const rendered = entries.map(([key]) => `${key}: true`).join(", ");
  return `\n    annotations: { ${rendered} },`;
}

function renderConsentNote(proposal: ToolProposal, mutating: boolean): string {
  if (!mutating) return "";

  if (requiresConsentGate(proposal.consent, mutating)) {
    return `
        // This tool changes data, so a person approves each call before it runs.
        // Replace requestApproval with your own prompt; returning false must mean
        // nothing happened.
        if (!(await requestApproval(${JSON.stringify(proposal.name)}, args))) {
          return text("The person using this page declined the request. Nothing was changed.", true);
        }
`;
  }

  return `
        // A person submits this form themselves, so the check already happened before
        // execute ran. Do not prompt again here: asking twice for one action teaches
        // people to click through both.
`;
}

/** A standalone module registering the tool, and the schema it registers. */
export function emitImperative(proposal: ToolProposal): ImperativeEmission {
  const schema = buildSchema(proposal);
  const mutating = proposal.annotations.readOnlyHint !== true;
  const formId = proposal.source.id;

  const formLookup = formId
    ? `document.querySelector<HTMLFormElement>(${JSON.stringify(`#${formId}`)})`
    : "document.querySelector<HTMLFormElement>(\"form\") /* TODO: this form has no id, give it one */";

  const assignments = proposal.params
    .map(
      (param) =>
        `        setValue(form, ${JSON.stringify(param.name)}, args[${JSON.stringify(param.name)}]);`,
    )
    .join("\n");

  const code = `/**
 * ${proposal.name}
 *
 * Generated by Toolsmith from ${formId ? `#${formId}` : "a form with no id"}.
 * Reviewed and approved by a person before it was emitted.
 *
 * Targets document.modelContext. Does nothing at all in a browser without WebMCP,
 * so the page keeps working exactly as it did.
 */

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

type Args = ${renderArgsType(proposal, schema)};

/** Tool output is capped at ${BUDGETS.toolOutput} characters. Keep results short and specific. */
function text(body: string, isError = false): ToolResult {
  const capped = body.length > ${BUDGETS.toolOutput} ? \`\${body.slice(0, ${BUDGETS.toolOutput - 15})}... [truncated]\` : body;
  return { content: [{ type: "text", text: capped }], isError };
}

${
  requiresConsentGate(proposal.consent, mutating)
    ? `/**
 * TODO: replace this with your own approval UI.
 *
 * It must resolve true only when a person has actually approved the call, and it must
 * show them the arguments. It returns false until you write it, so an unfinished
 * integration refuses to act rather than acting unattended.
 */
async function requestApproval(_toolName: string, _args: Args): Promise<boolean> {
  return false;
}

`
    : ""
}function setValue(form: HTMLFormElement, name: string, value: unknown): void {
  const field = form.elements.namedItem(name);
  if (!field) return;
  const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    element.checked = Boolean(value);
  } else {
    element.value = value === undefined || value === null ? "" : String(value);
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Registers the tool. Returns a function that unregisters it.
 *
 * Call the returned function when the UI this tool acts on goes away, so the set of
 * tools an agent can see matches what is actually on the page.
 */
export function register${proposal.name.replace(/(^|_)([a-z0-9])/g, (_m, _p, c: string) => c.toUpperCase())}(): () => void {
  // Feature detection. Without it this throws on every browser that has not shipped
  // WebMCP, which is most of them.
  const modelContext = document.modelContext;
  if (!modelContext) return () => {};

  const controller = new AbortController();

  void modelContext.registerTool(
    {
      name: ${JSON.stringify(proposal.name)},
      title: ${JSON.stringify(proposal.title)},
      description: ${JSON.stringify(proposal.description)},
      inputSchema: ${renderSchema(schema)},${renderAnnotations(proposal)}
      // Chrome calls execute with one argument, despite the published types saying
      // options is required. Reading options.signal directly throws.
      async execute(input: unknown, options?: { signal?: AbortSignal }): Promise<ToolResult> {
        const args = input as Args;
        const signal = options?.signal;
${renderConsentNote(proposal, mutating)}
        const form = ${formLookup};
        if (!form) return text("That part of the page is not available right now.", true);

${assignments || "        // No fillable controls on this form."}

        if (signal?.aborted) return text("The request was cancelled before anything happened.", true);

        // TODO: perform the action and return what happened, in one or two sentences.
        // Rules for what goes in here:
        //   1. Validate these arguments again on the server. The schema above is advice
        //      to the agent, not a guarantee, and nothing stops a caller ignoring it.
        //   2. Return no internal IDs, no URLs that grant access, and no upstream error
        //      text. Say what happened in your own words.
        //   3. If you cannot tell whether it worked, say so and say it is unsafe to
        //      retry. Never guess.
        return text("TODO: not implemented yet.", true);
      },
    },
    { signal: controller.signal },
  );

  return () => controller.abort();
}
`;

  return { code, schema };
}
