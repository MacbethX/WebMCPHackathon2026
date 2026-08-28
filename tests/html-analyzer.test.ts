/**
 * Analyzer tests. Parsing only: what the markup says, not what should be done about it.
 */

import { describe, expect, it } from "vitest";
import { analyzeHtml } from "@/lib/generator/html-analyzer";

const form = (inner: string, attrs = "") =>
  analyzeHtml(`<main><h2>Book a table</h2><form ${attrs}>${inner}</form></main>`)[0];

describe("controls", () => {
  it("reads constraints off an input", () => {
    const [control] = form(
      '<label for="a">Full name</label><input id="a" name="name" required minlength="2" maxlength="40" pattern="[A-Za-z ]+">',
    ).controls;

    expect(control).toMatchObject({
      name: "name",
      type: "text",
      label: "Full name",
      required: true,
      minLength: 2,
      maxLength: 40,
      pattern: "[A-Za-z ]+",
    });
  });

  it("defaults a typeless input to text", () => {
    expect(form('<input name="q">').controls[0].type).toBe("text");
  });

  it("reads select options, using the text when an option has no value", () => {
    const [control] = form(
      '<select name="size"><option value="s">Small</option><option>Large</option></select>',
    ).controls;

    expect(control.options).toEqual([
      { value: "s", label: "Small" },
      { value: "Large", label: "Large" },
    ]);
  });

  it("picks up an existing toolparamdescription", () => {
    const [control] = form('<input name="a" toolparamdescription="Already annotated.">').controls;
    expect(control.existingDescription).toBe("Already annotated.");
  });
});

describe("labels", () => {
  it("prefers an explicit label", () => {
    expect(form('<label for="x">Explicit</label><input id="x" name="a">').controls[0].label).toBe(
      "Explicit",
    );
  });

  it("falls back to a wrapping label, without swallowing the control's own text", () => {
    const [control] = form(
      '<label>Wrapping<select name="a"><option>Ignored</option></select></label>',
    ).controls;
    expect(control.label).toBe("Wrapping");
  });

  it("falls back to aria-label, then to nothing", () => {
    expect(form('<input name="a" aria-label="Aria">').controls[0].label).toBe("Aria");
    expect(form('<input name="a">').controls[0].label).toBeNull();
  });
});

describe("grouping", () => {
  it("folds a radio group into one control with options", () => {
    const { controls } = form(
      '<label for="r1">Small</label><input type="radio" id="r1" name="size" value="s" required>' +
        '<label for="r2">Large</label><input type="radio" id="r2" name="size" value="l">',
    );

    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ name: "size", type: "radio", required: true });
    expect(controls[0].options).toEqual([
      { value: "s", label: "Small" },
      { value: "l", label: "Large" },
    ]);
  });

  it("keeps a lone checkbox as one control", () => {
    const { controls } = form('<input type="checkbox" name="agree" value="yes">');
    expect(controls).toHaveLength(1);
    expect(controls[0].options).toEqual([{ value: "yes", label: "yes" }]);
  });
});

describe("what it refuses", () => {
  it("never exposes a password field, and says so", () => {
    const { controls, skipped } = form('<input type="password" name="pw">');

    expect(controls).toHaveLength(0);
    expect(skipped[0]).toMatchObject({ name: "pw", type: "password" });
    expect(skipped[0].reason).toContain("never exposed");
  });

  it("skips file inputs, disabled controls, and unnamed ones, with reasons", () => {
    const { controls, skipped } = form(
      '<input type="file" name="f"><input name="d" disabled><input id="no-name">',
    );

    expect(controls).toHaveLength(0);
    expect(skipped.map((s) => s.reason.slice(0, 12))).toEqual([
      "File inputs ",
      "The control ",
      "The control ",
    ]);
  });

  it("ignores buttons and hidden fields without reporting them as skipped", () => {
    const { controls, skipped } = form(
      '<input type="hidden" name="csrf"><button type="submit">Go</button><input name="a">',
    );

    expect(controls.map((c) => c.name)).toEqual(["a"]);
    expect(skipped).toHaveLength(0);
  });
});

describe("form context", () => {
  it("finds the heading above the form and the submit label", () => {
    const analyzed = form('<input name="a"><button type="submit">Request Reservation</button>');

    expect(analyzed.heading).toBe("Book a table");
    expect(analyzed.submitLabel).toBe("Request Reservation");
  });

  it("prefers a legend inside the form to a heading outside it", () => {
    const analyzed = form('<fieldset><legend>Inner</legend><input name="a"></fieldset>');
    expect(analyzed.heading).toBe("Inner");
  });

  it("records whether the method was declared, not just what it defaults to", () => {
    expect(form('<input name="a">')).toMatchObject({ method: "get", methodDeclared: false });
    expect(form('<input name="a">', 'method="get"')).toMatchObject({
      method: "get",
      methodDeclared: true,
    });
    expect(form('<input name="a">', 'method="POST"')).toMatchObject({
      method: "post",
      methodDeclared: true,
    });
  });

  it("notices an existing toolautosubmit", () => {
    expect(form('<input name="a">', "toolautosubmit").hasAutoSubmit).toBe(true);
    expect(form('<input name="a">').hasAutoSubmit).toBe(false);
  });

  it("returns one entry per form, in document order", () => {
    const forms = analyzeHtml(
      '<form id="one"><input name="a"></form><form id="two"><input name="b"></form>',
    );
    expect(forms.map((f) => f.id)).toEqual(["one", "two"]);
  });
});
