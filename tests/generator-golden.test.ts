/**
 * Golden tests for the generator (CLAUDE.md M3 exit).
 *
 * The declarative golden is not a snapshot of our own output. It is the schema Chrome
 * actually synthesized from this exact form, captured by hand in
 * research/raw/spike-2-chrome-declarative-synthesis.md. The emitter's job is to predict
 * what the browser will do, so the browser's real answer is the only honest target. If
 * Chrome changes, this test fails, which is the point.
 *
 * The input is the ChromeLabs bistro demo in the research pack, read from disk rather
 * than copied, so the fixture cannot drift from the thing the schema was captured from.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeHtml, parseFormElement } from "@/lib/generator/html-analyzer";
import { emitDeclarative } from "@/lib/generator/declarative-emitter";
import { emitImperative } from "@/lib/generator/imperative-emitter";
import { generate } from "@/lib/generator/generate";
import { proposeForForm } from "@/lib/generator/propose";

const BISTRO_HTML = readFileSync(
  join(process.cwd(), "research/raw/demos/french-bistro_index.html"),
  "utf8",
);

/**
 * Verbatim from research/raw/spike-2-chrome-declarative-synthesis.md. Captured from
 * Chrome 149 with the WebMCP Inspector, not written by us.
 */
const CHROME_SYNTHESIZED_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Customer's full name (min 2 chars)" },
    phone: { type: "string", description: "Customer's phone number (min 10 digits)" },
    date: {
      type: "string",
      format: "date",
      description:
        "Reservation date. Must be today or future. (Dates MUST be provided in 'YYYY-MM-DD' format.)",
    },
    time: {
      type: "string",
      format: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
      description: "Reservation time",
    },
    guests: {
      type: "string",
      anyOf: [
        { type: "string", const: "1", title: "1 Person" },
        { type: "string", const: "2", title: "2 People" },
        { type: "string", const: "3", title: "3 People" },
        { type: "string", const: "4", title: "4 People" },
        { type: "string", const: "5", title: "5 People" },
        { type: "string", const: "6", title: "6 People or more" },
      ],
      enum: ["1", "2", "3", "4", "5", "6"],
      description:
        "Number of people dining. Must be a string value between '1' and '5', or '6' for parties of 6 or more.",
    },
    seating: {
      type: "string",
      anyOf: [
        { type: "string", const: "Main Dining", title: "Main Dining Room" },
        { type: "string", const: "Terrace", title: "Terrace (Outdoor)" },
        { type: "string", const: "Private Booth", title: "Private Booth" },
        { type: "string", const: "Bar", title: "Bar Counter" },
      ],
      enum: ["Main Dining", "Terrace", "Private Booth", "Bar"],
      description: "Preferred seating area",
    },
    requests: { type: "string", description: "Special requests (allergies, occasions, etc.)" },
  },
  required: ["name", "phone", "date", "time", "guests"],
};

const bistroForm = () => analyzeHtml(BISTRO_HTML)[0];

describe("declarative emitter predicts what Chrome actually does", () => {
  it("matches the schema Chrome synthesized from this form, quirks and all", () => {
    const form = bistroForm();
    const proposal = proposeForForm(form);
    const element = parseFormElement(BISTRO_HTML, 0)!;

    const { predictedSchema } = emitDeclarative(proposal, element);

    expect(predictedSchema).toEqual(CHROME_SYNTHESIZED_SCHEMA);
  });

  it("reproduces the quirks individually, so a regression names itself", () => {
    const { predictedSchema } = emitDeclarative(
      proposeForForm(bistroForm()),
      parseFormElement(BISTRO_HTML, 0)!,
    );
    const properties = predictedSchema.properties!;

    // Everything is a string, including the guest count and the date.
    expect(Object.values(properties).every((p) => p.type === "string")).toBe(true);

    // A time input puts its regex in `format`, which is not what `format` means.
    expect(properties.time.format).toBe("^([01][0-9]|2[0-3]):[0-5][0-9]$");
    expect(properties.time.pattern).toBeUndefined();

    // A date input gets format:"date" and Chrome appends its own sentence.
    expect(properties.date.format).toBe("date");
    expect(properties.date.description).toContain("(Dates MUST be provided in 'YYYY-MM-DD' format.)");

    // A select says the same thing twice: const/title branches and a flat enum.
    expect(properties.guests.anyOf).toHaveLength(6);
    expect(properties.guests.enum).toEqual(["1", "2", "3", "4", "5", "6"]);

    // minlength="2" on name is nowhere to be found.
    expect(properties.name.minLength).toBeUndefined();
  });

  it("reports the constraints the form silently drops", () => {
    const { losses } = emitDeclarative(
      proposeForForm(bistroForm()),
      parseFormElement(BISTRO_HTML, 0)!,
    );

    expect(losses.join(" ")).toContain("minlength 2");
    expect(losses.join(" ")).toContain('"name"');
  });

  it("annotates the form with the three attributes and no autosubmit", () => {
    const { html } = emitDeclarative(
      proposeForForm(bistroForm()),
      parseFormElement(BISTRO_HTML, 0)!,
    );

    expect(html).toContain('toolname="book_table_le_petit_bistro"');
    expect(html).toContain("tooldescription=");
    expect(html.match(/toolparamdescription=/g)).toHaveLength(7);
    // Unanswered consent decision means the cautious default, whatever else is true.
    expect(html).not.toContain("toolautosubmit");
  });
});

describe("imperative emitter exceeds that", () => {
  const emission = () => emitImperative(proposeForForm(bistroForm()));

  it("keeps the constraints Chrome throws away", () => {
    const properties = emission().schema.properties!;

    expect(properties.name.minLength).toBe(2);
    expect(properties.name.type).toBe("string");
  });

  it("puts the time regex in pattern, where a regex belongs", () => {
    const properties = emission().schema.properties!;

    expect(properties.time.pattern).toBe("^([01][0-9]|2[0-3]):[0-5][0-9]$");
    expect(properties.time.format).toBeUndefined();
  });

  it("carries option labels once, not twice", () => {
    const properties = emission().schema.properties!;

    expect(properties.guests.oneOf).toEqual([
      { const: "1", title: "1 Person" },
      { const: "2", title: "2 People" },
      { const: "3", title: "3 People" },
      { const: "4", title: "4 People" },
      { const: "5", title: "5 People" },
      { const: "6", title: "6 People or more" },
    ]);
    expect(properties.guests.anyOf).toBeUndefined();
    expect(properties.guests.enum).toBeUndefined();
  });

  it("mirrors required from the form and closes the object", () => {
    const schema = emission().schema;

    expect(schema.required).toEqual(["name", "phone", "date", "time", "guests"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("emits feature detection, abort wiring, and the missing-options fallback", () => {
    const { code } = emission();

    expect(code).toContain("const modelContext = document.modelContext;");
    expect(code).toContain("if (!modelContext) return () => {};");
    expect(code).toContain("new AbortController()");
    expect(code).toContain("{ signal: controller.signal }");
    // Spike 5: reading options.signal directly throws in the current Chrome.
    expect(code).toContain("options?: { signal?: AbortSignal }");
    expect(code).toContain("options?.signal");
  });

  it("never emits navigator.modelContext", () => {
    expect(emission().code).not.toContain("navigator.modelContext");
  });

  it("tells the implementer to revalidate and to report ambiguity honestly", () => {
    const { code } = emission();

    expect(code).toContain("Validate these arguments again on the server");
    expect(code).toContain("unsafe to");
    expect(code).toContain("no upstream error");
  });
});

describe("the whole pipeline", () => {
  it("routes this form imperative, and says why in words", () => {
    const [generated] = generate(BISTRO_HTML);

    expect(generated.proposal.route).toBe("imperative");
    expect(generated.violations).toEqual([]);
    expect(generated.declarative).not.toBeNull();
    expect(generated.imperative).not.toBeNull();

    const reasons = generated.proposal.reasons.map((r) => r.reason).join(" ");
    expect(reasons).toContain("minlength 2");
    expect(reasons).toContain("Chrome's form synthesis drops");
  });

  it("treats a form with no method as mutating, not as a safe GET", () => {
    // The bistro form declares no method. The HTML default is GET, but a booking form
    // is not a query, and calling it read-only would let agents book tables unasked.
    const [generated] = generate(BISTRO_HTML);

    expect(generated.proposal.annotations.readOnlyHint).toBeUndefined();
    expect(generated.proposal.consent.question).toContain("changes anything");
  });

  it("produces output that passes our own budget linter", () => {
    for (const generated of generate(BISTRO_HTML)) {
      expect(generated.violations).toEqual([]);
      expect(generated.proposal.name.length).toBeLessThanOrEqual(30);
      expect(generated.proposal.description.length).toBeLessThanOrEqual(500);
      for (const param of generated.proposal.params) {
        expect(param.description.length).toBeLessThanOrEqual(150);
      }
    }
  });

  it("is deterministic: the same HTML twice gives the same code", () => {
    const first = generate(BISTRO_HTML);
    const second = generate(BISTRO_HTML);

    expect(second[0].imperative!.code).toBe(first[0].imperative!.code);
    expect(second[0].declarative!.html).toBe(first[0].declarative!.html);
  });
});
