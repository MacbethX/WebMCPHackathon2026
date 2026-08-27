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
 * Lints a tool declaration against every budget that applies before execution.
 * Output length is bounded separately, at result-construction time, by `boundText`.
 */
export function lintToolSpec(spec: ToolSpec): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  check(violations, "toolName", spec.name, spec.name);
  check(violations, "toolDescription", `${spec.name}.description`, spec.description);

  const properties = spec.inputSchema?.properties ?? {};
  for (const [paramName, property] of Object.entries(properties)) {
    check(violations, "paramName", `${spec.name}.${paramName}`, paramName);
    check(
      violations,
      "paramDescription",
      `${spec.name}.${paramName}.description`,
      property.description,
    );
  }

  return violations;
}

/** Renders violations as one line each, for throwing or logging. */
export function formatViolations(violations: BudgetViolation[]): string {
  return violations
    .map((v) => `${v.path}: ${v.actual} chars exceeds the ${v.budget} budget of ${v.limit}`)
    .join("; ");
}
