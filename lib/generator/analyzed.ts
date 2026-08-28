/**
 * What the analyzer extracts from pasted HTML.
 *
 * Deliberately a plain data description of the markup, with no opinions in it. The
 * opinions (what should become a tool, declarative or imperative, what it should be
 * called) live in `propose.ts`, so they can be changed, argued with, and overridden by a
 * human without touching the parsing.
 */

/** A single `<option>`, with the value an agent sends and the label a person reads. */
export interface AnalyzedOption {
  value: string;
  label: string;
}

/**
 * One form control that an agent could fill.
 *
 * `type` is the `type` attribute for inputs, or `"textarea"` / `"select"` for those
 * elements, matching how the browser treats them.
 */
export interface AnalyzedControl {
  name: string;
  type: string;
  /** From `<label for>`, a wrapping label, or `aria-label`. Null when there is none. */
  label: string | null;
  placeholder: string | null;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  /** `min`/`max` stay strings: on a date input they are dates, not numbers. */
  min?: string;
  max?: string;
  pattern?: string;
  /** Present for `<select>`, and for a grouped radio or checkbox set. */
  options?: AnalyzedOption[];
  /** The `value` attribute of a radio or checkbox: what it submits when chosen. */
  value?: string;
  /** An existing `toolparamdescription`, when the author already annotated the form. */
  existingDescription?: string;
}

export interface AnalyzedForm {
  /** The form's `id`, used to address it in emitted code. Null when it has none. */
  id: string | null;
  /** The effective method, defaulted to `get` the way the HTML spec does. */
  method: string;
  /**
   * Whether the form actually declared one.
   *
   * A form with no `method` is usually handled in JavaScript, and inferring "read-only"
   * from the spec's GET default would mark a booking form as safe to call unattended.
   * Wrong in the dangerous direction, so the distinction is kept.
   */
  methodDeclared: boolean;
  action: string | null;
  /** Controls an agent can fill. Excludes the skipped ones below. */
  controls: AnalyzedControl[];
  /** Text of the submit button, a good source for a tool title. */
  submitLabel: string | null;
  /** Nearest heading above the form, the other good source for a name. */
  heading: string | null;
  existingToolName?: string;
  existingToolDescription?: string;
  hasAutoSubmit: boolean;
  /**
   * Controls that were deliberately left out, and why. Surfaced to the human rather
   * than dropped silently: a missing field in a generated tool is a bug you find in
   * production.
   */
  skipped: SkippedControl[];
}

export interface SkippedControl {
  name: string;
  type: string;
  reason: string;
}
