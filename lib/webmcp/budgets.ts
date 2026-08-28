/**
 * Character budgets (CLAUDE.md rule 5).
 *
 * These are errors, not warnings. They apply to the tools this repo registers AND to
 * the code the generator emits. Source: Chrome's secure-tools guidance, recorded in
 * research/02_spec_api.md. They are documented as subject to change, so they live in
 * one table here rather than scattered through call sites.
 */

import type { ToolSpec } from "./types";

export const BUDGETS = {
  /** Tool name, characters. */
  toolName: 30,
  /** Parameter name, characters. */
  paramName: 30,
  /** Tool description, characters. */
  toolDescription: 500,
  /** Parameter description, characters. */
  paramDescription: 150,
  /** Total tool output text, characters. */
  toolOutput: 1500,
} as const;

export type BudgetKey = keyof typeof BUDGETS;

export interface BudgetViolation {
  /** Which budget was exceeded. */
  budget: BudgetKey;
  /** Where, e.g. `add_to_guestbook.properties.message.description`. */
  path: string;
  limit: number;
  actual: number;
}

function check(
  violations: BudgetViolation[],
  budget: BudgetKey,
  path: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  const limit = BUDGETS[budget];
  if (value.length > limit) {
    violations.push({ budget, path, limit, actual: value.length });
  }
}

/**
 * The shape every budget check actually needs: a name, a description, and named
 * parameters with descriptions. Both a live `ToolSpec` and a generated proposal reduce
 * to this, so one implementation covers our own tools and everything the generator
 * emits, which is what rule 5 asks for.
 */
export interface LintableDeclaration {
  name: string;
  description: string;
  params: ReadonlyArray<{ name: string; description?: string }>;
}

/**
 * Lints a declaration against every budget that applies before execution.
 * Output length is bounded separately, at result-construction time, by `boundText`.
 */
export function lintDeclaration(declaration: LintableDeclaration): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  check(violations, "toolName", declaration.name, declaration.name);
  check(violations, "toolDescription", `${declaration.name}.description`, declaration.description);

  for (const param of declaration.params) {
    check(violations, "paramName", `${declaration.name}.${param.name}`, param.name);
    check(
      violations,
      "paramDescription",
      `${declaration.name}.${param.name}.description`,
      param.description,
    );
  }

  return violations;
}

/** Lints a tool this app is about to register. */
export function lintToolSpec(spec: ToolSpec): BudgetViolation[] {
  return lintDeclaration({
    name: spec.name,
    description: spec.description,
    params: Object.entries(spec.inputSchema?.properties ?? {}).map(([name, property]) => ({
      name,
      description: property.description,
    })),
  });
}

/** Renders violations as one line each, for throwing or logging. */
export function formatViolations(violations: BudgetViolation[]): string {
  return violations
    .map((v) => `${v.path}: ${v.actual} chars exceeds the ${v.budget} budget of ${v.limit}`)
    .join("; ");
}
