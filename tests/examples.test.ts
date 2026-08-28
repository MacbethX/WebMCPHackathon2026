/**
 * The builder's examples.
 *
 * Each one is labelled with what it demonstrates, and a label that stops being true is
 * worse than no example: someone clicks it expecting to see a blocker and sees a normal
 * proposal instead. These tests hold the labels to their word.
 */

import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@/app/builder/examples";
import { generate } from "@/lib/generator/generate";
import { sanitizeHtml } from "@/lib/generator/sanitize";

const example = (id: string) => {
  const found = EXAMPLES.find((entry) => entry.id === id);
  if (!found) throw new Error(`No example ${id}`);
  return generate(sanitizeHtml(found.html).html);
};

describe("every example", () => {
  it("has a unique id and says what it demonstrates", () => {
    const ids = EXAMPLES.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of EXAMPLES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.demonstrates.length).toBeGreaterThan(20);
    }
  });

  it("survives the sanitizer with its forms intact", () => {
    for (const entry of EXAMPLES) {
      expect(generate(sanitizeHtml(entry.html).html).length).toBeGreaterThan(0);
    }
  });

  it("produces nothing that busts a budget", () => {
    for (const entry of EXAMPLES) {
      for (const generated of generate(sanitizeHtml(entry.html).html)) {
        expect(generated.violations).toEqual([]);
      }
    }
  });
});

describe("each one demonstrates what its label claims", () => {
  it("booking: routes imperative, because of constraints Chrome would drop", () => {
    const [generated] = example("booking");

    expect(generated.proposal.route).toBe("imperative");
    expect(generated.proposal.blockers).toEqual([]);
    expect(generated.proposal.reasons.map((reason) => reason.reason).join(" ")).toContain(
      "Chrome's form synthesis drops",
    );
  });

  it("search: is read-only, which changes the consent question", () => {
    const [generated] = example("search");

    expect(generated.proposal.annotations.readOnlyHint).toBe(true);
    expect(generated.proposal.consent.question).toContain("only reads");
    // A read-only tool is the one case where unattended is a legitimate answer.
    const unattended = generated.proposal.consent.choices.find(
      (choice) => choice.checkpoint === "none-needed",
    );
    expect(unattended?.available).toBe(true);
  });

  it("signin: is blocked, and says a tool from it could not sign anyone in", () => {
    const [generated] = example("signin");

    expect(generated.proposal.blockers).toHaveLength(1);
    expect(generated.proposal.blockers[0]).toContain("sign-in form");
  });

  it("twoforms: gives two tools, and the second is numbered", () => {
    const generated = example("twoforms");

    expect(generated).toHaveLength(2);
    expect(generated.map((entry) => entry.proposal.name)).toEqual(["sign_up", "sign_up_2"]);
  });
});
