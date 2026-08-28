/**
 * The generator, end to end: HTML in, reviewable proposals and both emissions out.
 *
 * Budgets are checked here, before anything is emitted, and a proposal that busts one
 * does not produce code. Rule 5 says the budgets apply to emitted code as much as to our
 * own tools, and a linter that runs after the code exists is a linter people paste past.
 */

import { formatViolations, lintDeclaration } from "../webmcp/budgets";
import { analyzeHtml, parseFormElement } from "./html-analyzer";
import { emitDeclarative } from "./declarative-emitter";
import { emitImperative } from "./imperative-emitter";
import { proposeForForm } from "./propose";
import type { BudgetViolation } from "../webmcp/budgets";
import type { DeclarativeEmission } from "./declarative-emitter";
import type { ImperativeEmission } from "./imperative-emitter";
import type { ToolProposal } from "./proposal";

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
  const forms = analyzeHtml(html);

  return forms.map((form, index) => {
    const proposal = proposeForForm(form);
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
