/**
 * HTML in, structure out.
 *
 * Parsing only. Nothing here decides what should become a tool or what it should be
 * called; that is `propose.ts`. Keeping the two apart means the routing rules can change
 * without anyone re-reading a DOM walk.
 *
 * Uses `DOMParser` rather than a parsing dependency: the builder runs in the browser,
 * and the browser already has a correct HTML parser that agrees with the one that will
 * eventually synthesize the tool.
 */

import type { AnalyzedControl, AnalyzedForm, AnalyzedOption, SkippedControl } from "./analyzed";

/** Input types that carry no value an agent should be filling in. */
const STRUCTURAL_INPUT_TYPES = new Set(["submit", "button", "reset", "image", "hidden"]);

/**
 * Input types excluded on purpose, with the reason a person gets told.
 *
 * A password field in a generated tool means an agent handling a credential, and a file
 * field means one that cannot be filled from a schema at all. Both are refusals, not
 * oversights, so they are reported rather than quietly dropped.
 */
const REFUSED_INPUT_TYPES: Record<string, string> = {
  password: "Password fields are never exposed as tool parameters.",
  file: "File inputs cannot be filled from a JSON schema.",
};

function parseDocument(html: string): Document {
  if (typeof DOMParser === "undefined") {
    throw new Error("The HTML analyzer needs DOMParser, which this environment lacks.");
  }
  return new DOMParser().parseFromString(html, "text/html");
}

function textOf(element: Element | null): string | null {
  const text = element?.textContent?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

/** Label text for a control: `<label for>`, then a wrapping label, then `aria-label`. */
function labelFor(control: Element, form: Element): string | null {
  const id = control.getAttribute("id");
  if (id) {
    // Escaping matters: ids can contain characters that are syntax in a selector.
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    const explicit = form.querySelector(`label[for="${escaped}"]`);
    const text = textOf(explicit);
    if (text) return text;
  }

  const wrapping = control.closest("label");
  if (wrapping) {
    // Strip the control's own text (a select carries its options' text) before reading.
    const clone = wrapping.cloneNode(true) as Element;
    clone.querySelectorAll("input, select, textarea").forEach((node) => node.remove());
    const text = textOf(clone);
    if (text) return text;
  }

  return control.getAttribute("aria-label")?.trim() || null;
}

function numberAttribute(element: Element, name: string): number | undefined {
  const raw = element.getAttribute(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function stringAttribute(element: Element, name: string): string | undefined {
  return element.getAttribute(name) ?? undefined;
}

function optionsOf(select: Element): AnalyzedOption[] {
  return Array.from(select.querySelectorAll("option")).map((option) => ({
    // An option with no value attribute submits its text, per the HTML spec.
    value: option.getAttribute("value") ?? (option.textContent ?? "").trim(),
    label: (option.textContent ?? "").replace(/\s+/g, " ").trim(),
  }));
}

function controlType(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return tag;
  return (element.getAttribute("type") ?? "text").toLowerCase();
}

/** The heading nearest above the form, walking back through previous siblings and up. */
function headingFor(form: Element): string | null {
  const HEADINGS = "h1, h2, h3, h4, h5, h6, legend";

  const legend = form.querySelector("legend");
  const legendText = textOf(legend);
  if (legendText) return legendText;

  let node: Element | null = form;
  while (node) {
    let sibling: Element | null = node.previousElementSibling;
    while (sibling) {
      if (sibling.matches(HEADINGS)) return textOf(sibling);
      const nested = sibling.querySelector(HEADINGS);
      if (nested) return textOf(nested);
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}

function analyzeControl(element: Element, form: Element): AnalyzedControl {
  const type = controlType(element);

  const control: AnalyzedControl = {
    name: element.getAttribute("name") ?? "",
    type,
    label: labelFor(element, form),
    placeholder: element.getAttribute("placeholder"),
    required: element.hasAttribute("required"),
  };

  const minLength = numberAttribute(element, "minlength");
  if (minLength !== undefined) control.minLength = minLength;
  const maxLength = numberAttribute(element, "maxlength");
  if (maxLength !== undefined) control.maxLength = maxLength;

  const min = stringAttribute(element, "min");
  if (min !== undefined) control.min = min;
  const max = stringAttribute(element, "max");
  if (max !== undefined) control.max = max;

  const pattern = stringAttribute(element, "pattern");
  if (pattern !== undefined) control.pattern = pattern;

  if (type === "select") control.options = optionsOf(element);

  // For a radio or checkbox the `value` attribute is the submitted value, not a default.
  if (type === "radio" || type === "checkbox") {
    control.value = element.getAttribute("value") ?? undefined;
  }

  const existing = element.getAttribute("toolparamdescription");
  if (existing) control.existingDescription = existing;

  return control;
}

/**
 * Folds a radio group, or a set of same-named checkboxes, into one control.
 *
 * Radios and checkboxes are several elements sharing one name; a schema needs one
 * parameter. Treating each element as its own parameter produces duplicate properties
 * and a tool that cannot express "pick one", which is the whole point of a radio group.
 */
function groupControls(controls: AnalyzedControl[]): AnalyzedControl[] {
  const grouped: AnalyzedControl[] = [];
  const byName = new Map<string, AnalyzedControl>();

  for (const control of controls) {
    const groupable = control.type === "radio" || control.type === "checkbox";
    if (!groupable) {
      grouped.push(control);
      continue;
    }

    const existing = byName.get(control.name);
    if (!existing) {
      const seed: AnalyzedControl = { ...control, options: control.options ?? [] };
      seed.options!.push({ value: control.value ?? "on", label: control.label ?? control.value ?? "on" });
      byName.set(control.name, seed);
      grouped.push(seed);
      continue;
    }

    existing.options!.push({
      value: control.value ?? "on",
      label: control.label ?? control.value ?? "on",
    });
    // A group is required if any member of it is.
    existing.required = existing.required || control.required;
    existing.label = existing.label ?? control.label;
  }

  return grouped;
}

function analyzeForm(form: Element): AnalyzedForm {
  const controls: AnalyzedControl[] = [];
  const skipped: SkippedControl[] = [];

  for (const element of Array.from(form.querySelectorAll("input, select, textarea"))) {
    const type = controlType(element);
    const name = element.getAttribute("name") ?? "";

    if (STRUCTURAL_INPUT_TYPES.has(type)) continue;

    if (type in REFUSED_INPUT_TYPES) {
      skipped.push({ name, type, reason: REFUSED_INPUT_TYPES[type] });
      continue;
    }
    if (element.hasAttribute("disabled")) {
      skipped.push({ name, type, reason: "The control is disabled." });
      continue;
    }
    if (!name) {
      skipped.push({
        name: element.getAttribute("id") ?? "(unnamed)",
        type,
        reason: "The control has no name attribute, so it submits nothing.",
      });
      continue;
    }

    controls.push(analyzeControl(element, form));
  }

  const submit = form.querySelector(
    'button[type="submit"], input[type="submit"], button:not([type])',
  );

  return {
    id: form.getAttribute("id"),
    method: (form.getAttribute("method") ?? "get").toLowerCase(),
    methodDeclared: form.hasAttribute("method"),
    action: form.getAttribute("action"),
    controls: groupControls(controls),
    submitLabel:
      textOf(submit) ?? submit?.getAttribute("value")?.trim() ?? null,
    heading: headingFor(form),
    existingToolName: form.getAttribute("toolname") ?? undefined,
    existingToolDescription: form.getAttribute("tooldescription") ?? undefined,
    hasAutoSubmit: form.hasAttribute("toolautosubmit"),
    skipped,
  };
}

/** Every form in the pasted HTML, in document order. */
export function analyzeHtml(html: string): AnalyzedForm[] {
  const document = parseDocument(html);
  return Array.from(document.querySelectorAll("form")).map(analyzeForm);
}

/** The parsed form element itself, for emitters that need to rewrite the markup. */
export function parseFormElement(html: string, index = 0): Element | null {
  const forms = parseDocument(html).querySelectorAll("form");
  return forms[index] ?? null;
}
