/**
 * The generator, end to end: HTML in, reviewable proposals and both emissions out.
 *
 * Budgets are checked here, before anything is emitted, and a proposal that busts one
 * does not produce code. Rule 5 says the budgets apply to emitted code as much as to our
 * own tools, and a linter that runs after the code exists is a linter people paste past.
 */

import { BUDGETS, formatViolations, lintDeclaration } from "../webmcp/budgets";
import { analyzeHtml, parseFormElement } from "./html-analyzer";
import { emitDeclarative } from "./declarative-emitter";
import { emitImperative } from "./imperative-emitter";
import { proposeForForm } from "./propose";
import type { BudgetViolation } from "../webmcp/budgets";
import type { DeclarativeEmission } from "./declarative-emitter";
import type { ImperativeEmission } from "./imperative-emitter";
import type { ToolProposal } from "./proposal";

/**
 * Caps on what will be processed.
 *
 * Not security boundaries: the sanitizer is that. These stop a page that is merely
 * enormous from locking the tab up while the parser walks it, and they are stated as
 * numbers a person can read rather than discovered as a hang.
 */
export const INPUT_LIMITS = {
  /** Characters of pasted HTML. Roughly a very large page. */
  maxCharacters: 400_000,
  /** Forms processed from one paste. */
  maxForms: 25,
} as const;

/** A reason the input will not be processed, or null when it is fine. */
export function checkInput(html: string): string | null {
  if (html.trim().length === 0) return "Paste some HTML first.";
  if (html.length > INPUT_LIMITS.maxCharacters) {
    return `That is ${html.length.toLocaleString()} characters, over the ${INPUT_LIMITS.maxCharacters.toLocaleString()} limit. Paste the part of the page with the form in it rather than the whole document.`;
  }
  return null;
}

/**
 * Makes every name in a batch unique.
 *
 * Two forms on a page routinely share a submit label ("Sign up" on both a newsletter
 * box and a waitlist), and the label is where a name comes from. Registering two tools
 * under one name means an agent cannot address either of them reliably, so the
 * duplicates are numbered. Refitted to the budget afterwards, since the suffix can push
 * a name over.
 */
export function deduplicateNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;

    const suffix = `_${count + 1}`;
    const trimmed = name.slice(0, Math.max(0, BUDGETS.toolName - suffix.length));
    return `${trimmed}${suffix}`;
  });
}

export interface GeneratedTool {
  proposal: ToolProposal;
  /** Both routes are always produced. `proposal.route` says which one is recommended. */
  declarative: DeclarativeEmission | null;
  imperative: ImperativeEmission | null;
  /** Non-empty means nothing was emitted. */
  violations: BudgetViolation[];
}

/** Lints a proposal against the character budgets. */
export function lintProposal(proposal: ToolProposal): BudgetViolation[] {
  return lintDeclaration({
    name: proposal.name,
    description: proposal.description,
    params: proposal.params,
  });
}

/**
 * Runs the whole pipeline over pasted HTML.
 *
 * One entry per form, in document order, whether or not it produced code. A form that
 * failed to lint still comes back, carrying its violations, because a person needs to
 * see what went wrong and fix the description rather than wonder where their form went.
 */
export function generate(html: string): GeneratedTool[] {
  const forms = analyzeHtml(html).slice(0, INPUT_LIMITS.maxForms);

  const proposals = forms.map(proposeForForm);
  const names = deduplicateNames(proposals.map((proposal) => proposal.name));

  return proposals.map((draft, index) => {
    const proposal = names[index] === draft.name ? draft : { ...draft, name: names[index] };
    const violations = lintProposal(proposal);

    if (violations.length > 0) {
      return { proposal, declarative: null, imperative: null, violations };
    }

    const element = parseFormElement(html, index);

    return {
      proposal,
      declarative: element ? emitDeclarative(proposal, element) : null,
      imperative: emitImperative(proposal),
      violations,
    };
  });
}

/** Re-emits after a person has edited or approved a proposal. */
export function regenerate(proposal: ToolProposal, formHtml: string): GeneratedTool {
  const violations = lintProposal(proposal);
  if (violations.length > 0) {
    return { proposal, declarative: null, imperative: null, violations };
  }

  const element = parseFormElement(formHtml, 0);

  return {
    proposal,
    declarative: element ? emitDeclarative(proposal, element) : null,
    imperative: emitImperative(proposal),
    violations,
  };
}

/** A one-line summary of why a proposal produced no code. */
export function explainViolations(violations: BudgetViolation[]): string {
  return formatViolations(violations);
}
