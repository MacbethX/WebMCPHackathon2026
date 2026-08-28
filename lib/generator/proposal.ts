/**
 * The proposal: what a human reviews, edits, and approves before any code exists.
 *
 * This is the contract between the three halves of Toolsmith. The analyzer fills it in
 * from markup, an agent improves the prose in it, a person edits and approves it, and
 * the emitters turn it into code. Everything reviewable lives here in plain fields, so
 * the review UI in M4 is a form over this type and nothing more.
 */

import type { AnalyzedControl, AnalyzedForm } from "./analyzed";
import type { ConsentDesign } from "./consent-design";

export type ToolRoute = "declarative" | "imperative";

export interface ProposedParam {
  /** The control's `name`, which is also the JSON Schema property name. */
  name: string;
  /** What the agent is told this is for. Budget: 150 characters. */
  description: string;
  required: boolean;
  /** The markup this came from, so emitters do not re-derive it. */
  control: AnalyzedControl;
}

/** A reason the recommendation went the way it did, in words a person can argue with. */
export interface RouteReason {
  route: ToolRoute;
  reason: string;
}

export interface ToolProposal {
  /** Budget: 30 characters. */
  name: string;
  title: string;
  /** Budget: 500 characters. */
  description: string;
  params: ProposedParam[];
  annotations: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  /** The recommendation. Both emitters still run; this says which one to prefer. */
  route: ToolRoute;
  /** Why, in full. Shown to the human, who may disagree and switch. */
  reasons: RouteReason[];
  /**
   * Who checks a call before it takes effect.
   *
   * Not a boolean, on purpose. See consent-design.ts: `toolautosubmit` is the consent
   * decision for a declarative tool, and a boolean field gets rendered as a checkbox.
   * This carries the question and the consequences of each answer, so a review UI can
   * only ask it as a question.
   */
  consent: ConsentDesign;
  /** Things the human should know before approving. */
  warnings: string[];
  /**
   * Reasons this proposal must not be approved as it stands.
   *
   * Distinct from `warnings`, which inform. A blocker means the tool cannot do what its
   * name says, so shipping it would put a lie in front of an agent. The review UI
   * refuses to approve while any of these stand.
   */
  blockers: string[];
  source: AnalyzedForm;
}
