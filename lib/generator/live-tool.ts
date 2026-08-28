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

import { emptyRecord } from "../webmcp/records";
import { toolError, toolText } from "../webmcp/tool-result";
import { toSchemaProperty } from "./imperative-emitter";
import type { JsonSchemaProperty, ToolSpec } from "../webmcp/types";
import type { ToolProposal } from "./proposal";

/** What happened when a value was written to a control. */
type WriteOutcome = "written" | "rejected" | "missing";

/**
 * Writes one value into a form control and checks that it took.
 *
 * The read-back is the point. Assigning an unmatched value to a `<select>` silently
 * leaves it empty, and the same goes for a malformed date or a non-numeric number. Left
 * unchecked, the tool reports having filled a field that is still blank, and the agent,
 * the person, and the receipt all end up believing something the page does not. That is
 * the divergence spike 6 warned about, in a different place.
 */
function setControlValue(form: HTMLFormElement, name: string, value: unknown): WriteOutcome {
  const field = form.elements.namedItem(name);
  if (!field) return "missing";

  const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = element.type === "radio" ? element.value === String(value) : Boolean(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return "written";
  }

  const wanted = value === undefined || value === null ? "" : String(value);
  element.value = wanted;

  if (element.value !== wanted) return "rejected";

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return "written";
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
  // The same schema the emitter writes into exported code, rather than a weaker
  // string-typed copy. An agent that is only told "string" will send "B" to a select
  // whose options are "a", "b", "c", and the write silently fails.
  const properties = emptyRecord<JsonSchemaProperty>();
  const required: string[] = [];

  for (const param of proposal.params) {
    properties[param.name] = toSchemaProperty(param.control, param.description);
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
      const rejected: string[] = [];
      const missing: string[] = [];

      for (const param of proposal.params) {
        const value = args[param.name];
        if (value === undefined) continue;

        switch (setControlValue(form, param.name, value)) {
          case "written":
            filled.push(`${param.name}: ${String(value)}`);
            break;
          case "rejected":
            rejected.push(`${param.name} would not take ${JSON.stringify(String(value))}`);
            break;
          case "missing":
            missing.push(param.name);
            break;
        }
      }

      if (filled.length === 0) {
        const why = rejected.length > 0 ? ` ${rejected.join("; ")}.` : "";
        return toolError(`Nothing was filled in.${why || " None of those fields exist on this form."}`);
      }

      const notes = [
        rejected.length > 0 ? `Rejected: ${rejected.join("; ")}.` : null,
        missing.length > 0 ? `Not on the form: ${missing.join(", ")}.` : null,
      ]
        .filter(Boolean)
        .join(" ");

      // A partial fill is reported as partial. Saying "filled the form" when a field was
      // refused is how an agent comes to believe something that is not on the screen.
      const result = toolText(
        `${rejected.length > 0 || missing.length > 0 ? "Partly filled" : "Filled"} the ${proposal.title} form. ${filled.join("; ")}. ${notes} This is a preview, so nothing was submitted anywhere.`.replace(
          /\s+/g,
          " ",
        ),
      );
      return rejected.length > 0 ? { ...result, isError: true } : result;
    },
  };
}
