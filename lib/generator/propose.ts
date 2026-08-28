/**
 * Analysis in, a reviewable proposal out.
 *
 * Deterministic. The same HTML always produces the same proposal, which is what makes
 * the golden tests worth anything. An agent refines the prose afterwards; it does not
 * change the shape, and nothing here depends on a model being available.
 *
 * Routing follows CLAUDE.md: declarative for form-shaped actions, imperative for
 * everything else and wherever hints or strict validation matter. The two things that
 * push a form to imperative are both losses, and both are recorded as reasons:
 *
 *   1. Declarative tools cannot carry annotations at all. Confirmed on our own form in
 *      spike 4: `annotations: null` where the imperative tools report theirs.
 *   2. Chrome's synthesis drops minlength, maxlength, min, max, and pattern. They
 *      survive only as prose in the description, if someone remembers to write it.
 *      Confirmed in spikes 2 and 4.
 */

import { BUDGETS } from "../webmcp/budgets";
import { designConsent } from "./consent-design";
import type { AnalyzedControl, AnalyzedForm } from "./analyzed";
import type { ProposedParam, RouteReason, ToolProposal } from "./proposal";

/** Constraints Chrome's form synthesis throws away. */
export function droppedConstraints(control: AnalyzedControl): string[] {
  const dropped: string[] = [];
  if (control.minLength !== undefined) dropped.push(`minlength ${control.minLength}`);
  if (control.maxLength !== undefined) dropped.push(`maxlength ${control.maxLength}`);
  if (control.min !== undefined) dropped.push(`min ${control.min}`);
  if (control.max !== undefined) dropped.push(`max ${control.max}`);
  if (control.pattern !== undefined) dropped.push("pattern");
  return dropped;
}

/** snake_case, ASCII, collapsed. The identifier an agent sees. */
export function toToolName(phrase: string): string {
  return phrase
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Trims to a budget on a word boundary where it can, hard otherwise. */
export function fitToBudget(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;

  const cut = collapsed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  // Only prefer the word boundary when it is not throwing away most of the budget.
  return lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
}

function nameFor(form: AnalyzedForm): string {
  if (form.existingToolName) return fitToBudget(form.existingToolName, BUDGETS.toolName);

  const phrase = form.submitLabel ?? form.heading ?? form.id ?? "submit_form";
  const candidate = toToolName(phrase);
  return fitToBudget(candidate || "submit_form", BUDGETS.toolName).replace(/_+$/, "");
}

function titleFor(form: AnalyzedForm): string {
  return form.submitLabel ?? form.heading ?? "Submit the form";
}

function isReadOnly(form: AnalyzedForm): boolean {
  // An explicit method="get" is conventionally a query. An absent method is not
  // evidence of anything: it defaults to GET in the spec, but in practice it means the
  // form is handled in JavaScript and could do anything. Assume mutating, because
  // marking a booking form read-only lets agents call it without asking.
  return form.methodDeclared && form.method === "get";
}

function descriptionFor(form: AnalyzedForm): string {
  if (form.existingToolDescription) {
    return fitToBudget(form.existingToolDescription, BUDGETS.toolDescription);
  }

  const subject = form.heading ? ` on ${form.heading}` : "";
  const action = titleFor(form).toLowerCase();
  const effect = isReadOnly(form)
    ? "Reads data and changes nothing."
    : "This changes data: it submits the form as if a person had.";

  return fitToBudget(
    `${action.charAt(0).toUpperCase()}${action.slice(1)}${subject}. ${effect} TODO: say what this does in the site's own words before approving.`,
    BUDGETS.toolDescription,
  );
}

/** A first draft of a parameter description, for a human to improve. */
export function describeControl(control: AnalyzedControl): string {
  if (control.existingDescription) {
    return fitToBudget(control.existingDescription, BUDGETS.paramDescription);
  }

  const subject = control.label ?? control.placeholder ?? control.name;
  const notes: string[] = [];

  if (control.type === "date") notes.push("a date");
  if (control.type === "time") notes.push("a time");
  if (control.type === "email") notes.push("an email address");
  if (control.type === "tel") notes.push("a phone number");
  if (control.type === "url") notes.push("a URL");
  if (control.type === "number") notes.push("a number");

  if (control.minLength !== undefined && control.maxLength !== undefined) {
    notes.push(`${control.minLength} to ${control.maxLength} characters`);
  } else if (control.minLength !== undefined) {
    notes.push(`at least ${control.minLength} characters`);
  } else if (control.maxLength !== undefined) {
    notes.push(`at most ${control.maxLength} characters`);
  }

  if (control.type !== "date" && control.type !== "time") {
    if (control.min !== undefined && control.max !== undefined) {
      notes.push(`between ${control.min} and ${control.max}`);
    } else if (control.min !== undefined) {
      notes.push(`${control.min} or more`);
    } else if (control.max !== undefined) {
      notes.push(`${control.max} or less`);
    }
  } else {
    if (control.min !== undefined) notes.push(`not before ${control.min}`);
    if (control.max !== undefined) notes.push(`not after ${control.max}`);
  }

  const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
  return fitToBudget(`${subject}${suffix}.`, BUDGETS.paramDescription);
}

function routeFor(form: AnalyzedForm, readOnly: boolean): RouteReason[] {
  const reasons: RouteReason[] = [];

  if (readOnly) {
    reasons.push({
      route: "imperative",
      reason:
        "This tool needs readOnlyHint so agents can skip a confirmation, and a form cannot carry annotations at all.",
    });
  }

  for (const control of form.controls) {
    const dropped = droppedConstraints(control);
    if (dropped.length > 0) {
      reasons.push({
        route: "imperative",
        reason: `"${control.name}" declares ${dropped.join(", ")}, which Chrome's form synthesis drops. Imperative keeps them as real schema.`,
      });
    }
  }

  if (reasons.length === 0) {
    reasons.push({
      route: "declarative",
      reason:
        "Form-shaped, no annotations needed, and nothing in it that Chrome's synthesis would lose. The browser can build this one.",
    });
  }

  return reasons;
}

function warningsFor(form: AnalyzedForm, params: ProposedParam[]): string[] {
  const warnings = form.skipped.map(
    (skip) => `Left out "${skip.name}" (${skip.type}). ${skip.reason}`,
  );

  if (params.length === 0) {
    warnings.push("This form has no fillable controls, so the tool would take no arguments.");
  }
  if (!form.id) {
    warnings.push("The form has no id. Emitted code needs one to find it; add an id first.");
  }
  if (form.hasAutoSubmit) {
    warnings.push(
      "This form already carries toolautosubmit, so agents can submit it today with nobody checking. That is a consent decision someone made; confirm it was deliberate.",
    );
  }
  return warnings;
}

/** One form, one proposal. */
export function proposeForForm(form: AnalyzedForm): ToolProposal {
  const readOnly = isReadOnly(form);

  const params: ProposedParam[] = form.controls.map((control) => ({
    name: control.name,
    description: describeControl(control),
    required: control.required,
    control,
  }));

  const reasons = routeFor(form, readOnly);
  const route = reasons.some((entry) => entry.route === "imperative")
    ? "imperative"
    : "declarative";

  return {
    name: nameFor(form),
    title: titleFor(form),
    description: descriptionFor(form),
    params,
    // readOnlyHint only when it is true. Rule 6 asks for it on non-mutating tools, and
    // an explicit `false` says nothing a missing hint does not already say.
    annotations: readOnly ? { readOnlyHint: true } : {},
    route,
    reasons,
    // The question, not an answer. Unanswered until a person answers it, and the
    // emitters keep the cautious default until then.
    consent: designConsent({ mutating: !readOnly }),
    warnings: warningsFor(form, params),
    source: form,
  };
}

/** Every form in the pasted HTML becomes one proposal, in document order. */
export function propose(forms: readonly AnalyzedForm[]): ToolProposal[] {
  return forms.map(proposeForForm);
}
