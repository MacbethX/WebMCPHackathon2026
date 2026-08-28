/**
 * Turning an approved proposal into a tool that actually runs.
 *
 * The builder renders the pasted markup in a preview, so an approved tool has a real
 * form to act on. Which route it takes decides who does the registering:
 *
 * | Route | Who registers | What happens on a call |
 * |---|---|---|
 * | declarative | The browser, from attributes we write onto the preview form | The browser fills the form and waits, or submits if the consent decision said so |
 * | imperative | Us, through the registration manager | Our `execute` fills the form and reports what it filled |
 *
 * The imperative tool stops at filling. The preview is somebody else's markup with no
 * backend behind it, so submitting it would either do nothing or navigate. Saying "these
 * are the values I put in the form" is the honest result, and it is the one a person
 * reviewing the builder can check against what is on screen.
 */

import { toolError, toolText } from "../webmcp/tool-result";
import type { ToolSpec } from "../webmcp/types";
import type { ToolProposal } from "./proposal";

/** Writes one value into a form control, notifying anything listening. */
function setControlValue(form: HTMLFormElement, name: string, value: unknown): boolean {
  const field = form.elements.namedItem(name);
  if (!field) return false;

  const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = element.type === "radio" ? element.value === String(value) : Boolean(value);
  } else {
    element.value = value === undefined || value === null ? "" : String(value);
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * The imperative tool for an approved proposal.
 *
 * `findForm` is a callback rather than an element so the tool survives the preview being
 * re-rendered: the registration outlives any particular DOM node.
 */
export function buildLiveTool(
  proposal: ToolProposal,
  findForm: () => HTMLFormElement | null,
): ToolSpec {
  const properties: Record<string, { type?: string; description?: string }> = {};
  const required: string[] = [];

  for (const param of proposal.params) {
    properties[param.name] = { type: "string", description: param.description };
    if (param.required) required.push(param.name);
  }

  return {
    name: proposal.name,
    title: proposal.title,
    description: proposal.description,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
    annotations: proposal.annotations,
    execute: (args) => {
      const form = findForm();
      if (!form) {
        return toolError("The form this tool belongs to is not on the page right now.");
      }

      const filled: string[] = [];
      const missing: string[] = [];

      for (const param of proposal.params) {
        const value = args[param.name];
        if (value === undefined) continue;
        if (setControlValue(form, param.name, value)) {
          filled.push(`${param.name}: ${String(value)}`);
        } else {
          missing.push(param.name);
        }
      }

      if (filled.length === 0) {
        return toolError("Nothing was filled in: none of those fields exist on this form.");
      }

      const note = missing.length > 0 ? ` Not on the form: ${missing.join(", ")}.` : "";
      return toolText(
        `Filled the ${proposal.title} form. ${filled.join("; ")}.${note} This is a preview, so nothing was submitted anywhere.`,
      );
    },
  };
}
