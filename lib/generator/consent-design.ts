/**
 * The consent decision for a generated tool, as a type.
 *
 * Spike 6 established that `toolautosubmit` is not a convenience attribute. Without it
 * the browser fills the form and waits for a person; with it nothing does. It is the
 * consent decision for a declarative tool, and it is the only one of these attributes
 * whose wrong setting cannot be undone by a later code review, because the harm happens
 * the first time an agent runs.
 *
 * So it is not modelled as a boolean. A field called `autoSubmit: boolean` gets rendered
 * as a checkbox labelled "submit automatically" by whoever builds the UI next, and a
 * checkbox is the wrong shape for a question about who is accountable. This module makes
 * the question, its answers, and their consequences part of the data, so a review UI can
 * only present it as a choice between named checkpoints, and cannot present it as a
 * toggle.
 *
 * Rule 9 sets the floor: a state-changing tool always has a human checkpoint somewhere.
 * The decision is which one, never whether.
 */

/** Who checks a tool call before it takes effect. */
export type HumanCheckpoint =
  /**
   * No `toolautosubmit`. The browser fills the form, the page highlights it via
   * `:tool-form-active`, and a person presses the button. The check is the platform's,
   * and the person sees the real form with real values in it.
   */
  | "person-submits"
  /**
   * `toolautosubmit` plus the app-side consent gate. The agent submits without waiting,
   * and the gate intercepts with the arguments shown before anything is written.
   */
  | "person-approves"
  /**
   * `toolautosubmit` and no gate. Legal only for a tool that changes nothing, where
   * there is no consequence to consent to.
   */
  | "none-needed";

export interface CheckpointChoice {
  checkpoint: HumanCheckpoint;
  /** Phrased as what happens, not as a setting name. */
  label: string;
  /** The consequence of choosing it, in plain terms. */
  consequence: string;
  available: boolean;
  /** Why this choice is not offered, when it is not. */
  unavailableReason?: string;
}

export interface ConsentDesign {
  /**
   * The question a review UI must put to a person. Carried as data so it cannot be
   * quietly replaced with a field label.
   */
  question: string;
  /** In force until a person answers. Always the most cautious available choice. */
  choice: HumanCheckpoint;
  /**
   * False until a person has actually chosen. Emitters refuse to widen beyond the
   * default while this is false, so an unreviewed proposal cannot ship an open door.
   */
  answered: boolean;
  choices: CheckpointChoice[];
}

/**
 * Builds the decision for one tool.
 *
 * A read-only tool gets all three, defaulting to the platform check anyway. A mutating
 * tool gets the two that keep a person in the loop, and is told why the third is absent.
 */
export function designConsent(options: { mutating: boolean }): ConsentDesign {
  const { mutating } = options;

  const choices: CheckpointChoice[] = [
    {
      checkpoint: "person-submits",
      label: "A person presses the button",
      consequence:
        "The agent fills the form and stops. Someone sees the filled-in form and submits it. Nothing happens if they walk away.",
      available: true,
    },
    {
      checkpoint: "person-approves",
      label: "A person approves a prompt",
      consequence:
        "The agent submits straight away and a prompt appears showing exactly what it sent. Nothing is written until someone approves. Faster for the agent, and the person reads values rather than a form.",
      available: true,
    },
    {
      checkpoint: "none-needed",
      label: "Nobody needs to check",
      consequence: mutating
        ? "Not offered. This tool changes data, so something must check first."
        : "The agent runs it unattended. This tool only reads, so there is nothing to undo.",
      available: !mutating,
      unavailableReason: mutating
        ? "This tool changes data. Rule 9 requires a human checkpoint on every state-changing tool, so this choice does not exist for it."
        : undefined,
    },
  ];

  return {
    question: mutating
      ? "Before this tool changes anything, who checks it?"
      : "This tool only reads. Who, if anyone, should check before it runs?",
    // The cautious default, in force until someone decides otherwise.
    choice: "person-submits",
    answered: false,
    choices,
  };
}

/** Records a person's answer. Refuses a choice that was never on offer. */
export function answerConsent(
  design: ConsentDesign,
  checkpoint: HumanCheckpoint,
): ConsentDesign {
  const choice = design.choices.find((entry) => entry.checkpoint === checkpoint);

  if (!choice || !choice.available) {
    throw new Error(
      choice?.unavailableReason ??
        `"${checkpoint}" is not an available checkpoint for this tool.`,
    );
  }

  return { ...design, choice: checkpoint, answered: true };
}

/**
 * Whether emitted markup carries `toolautosubmit`.
 *
 * An unanswered decision never does, whatever its `choice` says. The default is the
 * cautious one, and code generated from an unreviewed proposal keeps it.
 */
export function emitsAutoSubmit(design: ConsentDesign): boolean {
  if (!design.answered) return false;
  return design.choice === "person-approves" || design.choice === "none-needed";
}

/** Whether emitted code wraps `execute` in the app-side consent gate. */
export function requiresConsentGate(design: ConsentDesign, mutating: boolean): boolean {
  if (!mutating) return false;
  // A mutating tool that an agent can submit unattended has only the gate left.
  // A mutating tool a person submits is already checked, and gating again asks twice.
  return !design.answered || design.choice === "person-approves";
}
