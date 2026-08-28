/**
 * Sanitizer for pasted HTML.
 *
 * The builder renders what you paste, so that approved tools have a real form to act on.
 * That means running someone else's markup inside our origin, which is the same origin
 * holding the receipt ledger's signing key. An allowlist, not a blocklist: anything not
 * named here is removed, so a tag nobody thought of fails closed.
 *
 * What this is not: a general-purpose HTML sanitizer. It knows about forms and the
 * markup that surrounds them, which is all the builder needs, and it is deliberately
 * narrow so it can be read in one sitting and argued with.
 */

/** Elements kept. Everything else is unwrapped or dropped. */
const ALLOWED_ELEMENTS = new Set([
  "form", "fieldset", "legend", "label", "input", "select", "option", "optgroup",
  "textarea", "button", "output", "datalist", "progress", "meter",
  "div", "span", "p", "section", "article", "main", "aside", "header", "footer", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "strong", "em", "b", "i", "u", "s", "small", "sub", "sup", "code", "pre", "kbd",
  "blockquote", "hr", "br", "figure", "figcaption", "abbr", "time", "mark", "picture",
  "img", "a",
]);

/**
 * Elements removed with their contents, rather than unwrapped.
 *
 * Unwrapping a `<script>` would paste its source into the page as text, which is noise;
 * unwrapping a `<style>` would do the same. Neither has readable content.
 */
const DROP_WITH_CONTENTS = new Set([
  "script", "style", "iframe", "object", "embed", "base", "link", "meta",
  "noscript", "template", "svg", "math", "canvas", "audio", "video", "source", "track",
  "frame", "frameset", "applet", "portal", "dialog",
]);

/** Attributes kept on any element. */
const GLOBAL_ATTRIBUTES = new Set([
  "id", "class", "title", "lang", "dir", "role", "hidden",
  "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden", "aria-required",
]);

/** Attributes kept, per element. */
const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
  form: new Set(["accept-charset", "autocomplete", "novalidate", "name"]),
  input: new Set([
    "type", "name", "value", "placeholder", "required", "disabled", "readonly",
    "checked", "min", "max", "step", "minlength", "maxlength", "pattern",
    "autocomplete", "multiple", "list", "size",
  ]),
  textarea: new Set([
    "name", "placeholder", "required", "disabled", "readonly",
    "minlength", "maxlength", "rows", "cols", "wrap", "autocomplete",
  ]),
  select: new Set(["name", "required", "disabled", "multiple", "size", "autocomplete"]),
  option: new Set(["value", "selected", "disabled", "label"]),
  optgroup: new Set(["label", "disabled"]),
  button: new Set(["type", "name", "value", "disabled"]),
  label: new Set(["for"]),
  output: new Set(["for", "name"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  a: new Set(["href", "rel"]),
  th: new Set(["colspan", "rowspan", "scope", "headers"]),
  td: new Set(["colspan", "rowspan", "headers"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  time: new Set(["datetime"]),
  progress: new Set(["value", "max"]),
  meter: new Set(["value", "min", "max", "low", "high", "optimum"]),
};

/** The declarative WebMCP attributes, kept so already-annotated markup survives. */
const TOOL_ATTRIBUTES = new Set([
  "toolname", "tooldescription", "toolparamdescription", "toolautosubmit",
]);

/** Attributes carrying a URL, which need their scheme checked. */
const URL_ATTRIBUTES = new Set(["href", "src"]);

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;

export interface SanitizeResult {
  html: string;
  /** What was removed, so the person pasting is told rather than left guessing. */
  removed: string[];
}

function isSafeUrl(value: string): boolean {
  // Control characters and whitespace are how `java\nscript:` gets past a naive check.
  const cleaned = value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
  if (cleaned.startsWith("javascript:") || cleaned.startsWith("data:") || cleaned.startsWith("vbscript:")) {
    return false;
  }
  return SAFE_URL.test(cleaned) || !cleaned.includes(":");
}

function scrubAttributes(element: Element, removed: Set<string>): void {
  const tag = element.tagName.toLowerCase();
  const allowed = ELEMENT_ATTRIBUTES[tag];

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();

    // Every event handler, in one rule, before any allowlist gets consulted.
    if (name.startsWith("on")) {
      element.removeAttribute(attribute.name);
      removed.add(`event handler ${name}`);
      continue;
    }

    // `formaction` and `target` on a submit control override the form's own action.
    if (name === "formaction" || name === "formtarget" || name === "target" || name === "action") {
      element.removeAttribute(attribute.name);
      removed.add(`${name} (the preview never navigates)`);
      continue;
    }

    // Inline styles can position an invisible element over the page's own controls.
    if (name === "style") {
      element.removeAttribute(attribute.name);
      removed.add("inline style");
      continue;
    }

    const permitted =
      GLOBAL_ATTRIBUTES.has(name) ||
      TOOL_ATTRIBUTES.has(name) ||
      allowed?.has(name) ||
      name.startsWith("data-");

    if (!permitted) {
      element.removeAttribute(attribute.name);
      removed.add(`${tag}[${name}]`);
      continue;
    }

    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value)) {
      element.removeAttribute(attribute.name);
      removed.add(`unsafe URL in ${tag}[${name}]`);
    }
  }
}

function scrub(root: ParentNode, removed: Set<string>): void {
  // Snapshot first: the walk mutates the tree underneath itself.
  for (const element of Array.from(root.querySelectorAll("*"))) {
    // A previous iteration may already have taken this node's ancestor away.
    if (!root.contains(element)) continue;

    const tag = element.tagName.toLowerCase();

    if (DROP_WITH_CONTENTS.has(tag)) {
      element.remove();
      removed.add(`<${tag}> and its contents`);
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(tag)) {
      // Unwrap rather than delete: an unknown wrapper should not take the form inside
      // it away with it.
      element.replaceWith(...Array.from(element.childNodes));
      removed.add(`<${tag}> (unwrapped, contents kept)`);
      continue;
    }

    scrubAttributes(element, removed);
  }
}

/**
 * Strips everything the preview must not run, and reports what went.
 *
 * A link keeps its href but gains `rel="noopener noreferrer"`, and forms lose their
 * `action` entirely: the preview exists to be tooled, not to submit anywhere.
 */
export function sanitizeHtml(html: string): SanitizeResult {
  if (typeof DOMParser === "undefined") {
    throw new Error("The sanitizer needs DOMParser, which this environment lacks.");
  }

  // Parsed into a template rather than straight into a document. The HTML parser sends
  // a leading <script> or <style> to <head>, so scrubbing only <body> would miss it and
  // report nothing removed. A template's contents parse as one inert tree, scripts
  // included and none of them running.
  const host = new DOMParser().parseFromString("<!doctype html><body></body>", "text/html");
  const template = host.createElement("template");
  template.innerHTML = html;

  const removed = new Set<string>();
  scrub(template.content, removed);

  for (const anchor of Array.from(template.content.querySelectorAll("a[href]"))) {
    anchor.setAttribute("rel", "noopener noreferrer");
  }

  return { html: template.innerHTML, removed: Array.from(removed).sort() };
}
