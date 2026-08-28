/**
 * Declarative emitter: annotated form markup, plus what Chrome will make of it.
 *
 * Two outputs, and the second is the point. Emitting `toolname` and friends is easy.
 * The useful part is telling a person what schema the browser will actually synthesize
 * from their form, quirks included, so they can see what the agent will see before they
 * ship it.
 *
 * The predicted schema reproduces Chrome's behaviour as captured in
 * research/raw/spike-2-chrome-declarative-synthesis.md, not what a correct
 * implementation would produce. Where Chrome is wrong, this is wrong the same way on
 * purpose. Three known quirks:
 *
 *   1. Every value is typed `string`, including numbers and dates.
 *   2. A `time` input puts a regex in `format`, which is not what `format` means.
 *   3. A `date` input gets `format: "date"` and Chrome appends a sentence to the
 *      description telling the agent to use YYYY-MM-DD.
 *
 * And one loss, which is why most forms route imperative: `minlength`, `maxlength`,
 * `min`, `max`, and `pattern` do not survive. They are reported in `losses`.
 */

import { emitsAutoSubmit } from "./consent-design";
import { droppedConstraints } from "./propose";
import type { AnalyzedControl } from "./analyzed";
import type { JsonSchemaObject, JsonSchemaProperty } from "../webmcp/types";
import type { ToolProposal } from "./proposal";

/** Chrome's own wording, appended to every date field's description. */
export const CHROME_DATE_NOTE = "(Dates MUST be provided in 'YYYY-MM-DD' format.)";

/** The regex Chrome puts in `format` for a time input. */
export const CHROME_TIME_FORMAT = "^([01][0-9]|2[0-3]):[0-5][0-9]$";

export interface DeclarativeEmission {
  /** The form, with the tool attributes added. */
  html: string;
  /** What Chrome will synthesize from that markup. */
  predictedSchema: JsonSchemaObject;
  /** What the form cannot express, stated plainly. */
  losses: string[];
}

/** One control's predicted property, Chrome's way. */
export function predictProperty(
  control: AnalyzedControl,
  description: string,
): JsonSchemaProperty {
  const property: JsonSchemaProperty = { type: "string" };

  if (control.type === "select" && control.options) {
    // The dual shape: anyOf of const/title branches AND a flat enum alongside it.
    property.anyOf = control.options.map((option) => ({
      type: "string",
      const: option.value,
      title: option.label,
    }));
    property.enum = control.options.map((option) => option.value);
  }

  if (control.type === "date") {
    property.format = "date";
    property.description = `${description} ${CHROME_DATE_NOTE}`.trim();
    return property;
  }

  if (control.type === "time") {
    property.format = CHROME_TIME_FORMAT;
  }

  property.description = description;
  return property;
}

/** The schema Chrome will synthesize from the annotated form. */
export function predictSchema(proposal: ToolProposal): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const param of proposal.params) {
    properties[param.name] = predictProperty(param.control, param.description);
    if (param.required) required.push(param.name);
  }

  return { type: "object", properties, required };
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Everything the form silently drops, per control, plus the annotation loss.
 *
 * Stated as losses rather than warnings because nothing is broken: the tool works, it
 * is just weaker than the same tool written imperatively. A person choosing declarative
 * should be choosing it knowing this.
 */
export function describeLosses(proposal: ToolProposal): string[] {
  const losses: string[] = [];

  for (const param of proposal.params) {
    const dropped = droppedConstraints(param.control);
    if (dropped.length > 0) {
      losses.push(
        `"${param.name}": ${dropped.join(", ")} will not reach the agent. It survives only if the description says so in words.`,
      );
    }
    if (param.control.type === "number") {
      losses.push(
        `"${param.name}" is a number input, but the synthesized schema types it as a string.`,
      );
    }
  }

  if (proposal.annotations.readOnlyHint || proposal.annotations.untrustedContentHint) {
    losses.push(
      "Annotations cannot go on a form. This tool will report no readOnlyHint and no untrustedContentHint, so agents cannot tell it is safe to call without asking.",
    );
  }

  return losses;
}

/**
 * Adds the tool attributes to a parsed form element, in place.
 *
 * Takes an element rather than a string so the caller owns the document. `toolautosubmit`
 * is written only when a person has actually chosen a checkpoint that warrants it; an
 * unanswered proposal never emits it.
 */
export function annotateForm(form: Element, proposal: ToolProposal): void {
  form.setAttribute("toolname", proposal.name);
  form.setAttribute("tooldescription", proposal.description);

  if (emitsAutoSubmit(proposal.consent)) {
    form.setAttribute("toolautosubmit", "");
  } else {
    form.removeAttribute("toolautosubmit");
  }

  for (const param of proposal.params) {
    const escaped = escapeAttribute(param.name);
    const control = form.querySelector(`[name="${escaped}"]`);
    control?.setAttribute("toolparamdescription", param.description);
  }
}

/** Annotated markup and the schema it will produce. */
export function emitDeclarative(
  proposal: ToolProposal,
  formElement: Element,
): DeclarativeEmission {
  const clone = formElement.cloneNode(true) as Element;
  annotateForm(clone, proposal);

  return {
    html: clone.outerHTML,
    predictedSchema: predictSchema(proposal),
    losses: describeLosses(proposal),
  };
}
