/**
 * Consent design tests.
 *
 * This is the part of the generator where being wrong is expensive: `toolautosubmit`
 * decides whether anyone is standing between an agent and someone else's data. The
 * tests below are mostly about what the generator refuses to do.
 */

import { describe, expect, it } from "vitest";
import {
  answerConsent,
  designConsent,
  emitsAutoSubmit,
  requiresConsentGate,
} from "@/lib/generator/consent-design";

const mutating = () => designConsent({ mutating: true });
const readOnly = () => designConsent({ mutating: false });

describe("the question", () => {
  it("asks who checks, not whether to submit automatically", () => {
    expect(mutating().question).toBe("Before this tool changes anything, who checks it?");
    expect(readOnly().question).toContain("only reads");
  });

  it("states a consequence for every choice, not just a label", () => {
    for (const choice of mutating().choices) {
      expect(choice.consequence.length).toBeGreaterThan(20);
      expect(choice.label).not.toMatch(/auto|submit automatically/i);
    }
  });
});

describe("what a mutating tool may choose", () => {
  it("offers the two checkpoints that keep a person in the loop", () => {
    const available = mutating()
      .choices.filter((c) => c.available)
      .map((c) => c.checkpoint);

    expect(available).toEqual(["person-submits", "person-approves"]);
  });

  it("does not offer an unattended option, and explains the absence", () => {
    const none = mutating().choices.find((c) => c.checkpoint === "none-needed")!;

    expect(none.available).toBe(false);
    expect(none.unavailableReason).toContain("Rule 9");
  });

  it("refuses to record a choice that was never on offer", () => {
    expect(() => answerConsent(mutating(), "none-needed")).toThrow(/Rule 9/);
  });

  it("lets a read-only tool run unattended", () => {
    const answered = answerConsent(readOnly(), "none-needed");
    expect(answered.choice).toBe("none-needed");
    expect(emitsAutoSubmit(answered)).toBe(true);
  });
});

describe("fail closed", () => {
  it("defaults to the platform's own check", () => {
    expect(mutating().choice).toBe("person-submits");
    expect(mutating().answered).toBe(false);
  });

  it("emits no toolautosubmit until a person has actually answered", () => {
    expect(emitsAutoSubmit(mutating())).toBe(false);
    // Even for a read-only tool, where unattended would be legitimate.
    expect(emitsAutoSubmit(readOnly())).toBe(false);
  });

  it("emits toolautosubmit only for an answered, widened choice", () => {
    expect(emitsAutoSubmit(answerConsent(mutating(), "person-submits"))).toBe(false);
    expect(emitsAutoSubmit(answerConsent(mutating(), "person-approves"))).toBe(true);
  });

  it("gates an unreviewed mutating tool rather than trusting the default", () => {
    expect(requiresConsentGate(mutating(), true)).toBe(true);
  });
});

describe("where the gate goes", () => {
  it("gates the unattended case, because nothing else is standing there", () => {
    const answered = answerConsent(mutating(), "person-approves");
    expect(requiresConsentGate(answered, true)).toBe(true);
  });

  it("does not gate a form a person submits, because that would ask twice", () => {
    const answered = answerConsent(mutating(), "person-submits");
    expect(requiresConsentGate(answered, true)).toBe(false);
  });

  it("never gates a read-only tool", () => {
    expect(requiresConsentGate(readOnly(), false)).toBe(false);
    expect(requiresConsentGate(answerConsent(readOnly(), "none-needed"), false)).toBe(false);
  });
});
