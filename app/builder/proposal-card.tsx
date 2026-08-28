"use client";

/**
 * One proposal, for a person to read, edit, and approve.
 *
 * The consent decision is rendered from `proposal.consent`, which carries the question
 * and the consequence of each answer as data. That is deliberate: a field named
 * `autoSubmit: boolean` would end up here as a checkbox labelled "submit automatically",
 * and the thing it decides is who is accountable when an agent acts. See
 * lib/generator/consent-design.ts.
 *
 * Budgets are shown as live counters rather than enforced on keystroke. Someone editing
 * a description should be able to overshoot mid-sentence; approval is where the limit
 * bites.
 */

import { BUDGETS } from "@/lib/webmcp/budgets";
import { answerConsent } from "@/lib/generator/consent-design";
import type { HumanCheckpoint } from "@/lib/generator/consent-design";
import type { GeneratedTool } from "@/lib/generator/generate";
import type { ToolProposal } from "@/lib/generator/proposal";
import styles from "./builder.module.css";

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className={over ? `${styles.counter} ${styles.counterOver}` : styles.counter}>
      {value.length}/{limit}
    </span>
  );
}

export interface ProposalCardProps {
  generated: GeneratedTool;
  approved: boolean;
  busy: boolean;
  onChange: (proposal: ToolProposal) => void;
  onApprove: () => void;
  onRevoke: () => void;
  onRefine: () => void;
  refineAvailable: boolean;
}

export function ProposalCard({
  generated,
  approved,
  busy,
  onChange,
  onApprove,
  onRevoke,
  onRefine,
  refineAvailable,
}: ProposalCardProps) {
  const { proposal, declarative, imperative, violations } = generated;
  const emission = proposal.route === "declarative" ? declarative : imperative;

  const blocked = proposal.blockers.length > 0;

  const overBudget =
    proposal.name.length > BUDGETS.toolName ||
    proposal.description.length > BUDGETS.toolDescription ||
    proposal.params.some((param) => param.description.length > BUDGETS.paramDescription);

  const setRoute = (route: ToolProposal["route"]) => onChange({ ...proposal, route });

  const setCheckpoint = (checkpoint: HumanCheckpoint) => {
    try {
      onChange({ ...proposal, consent: answerConsent(proposal.consent, checkpoint) });
    } catch {
      // The choice was not on offer. The radio for it is disabled, so this is a
      // keyboard or scripted path; ignoring it keeps the refusal authoritative.
    }
  };

  return (
    <article className={approved ? `${styles.proposal} ${styles.proposalApproved}` : styles.proposal}>
      <div className={styles.proposalHead}>
        <p className={styles.toolName}>{proposal.name}</p>
        <span className={styles.routeTag}>{proposal.route}</span>
        {approved ? <span className={styles.routeTag}>registered</span> : null}
      </div>

      <label className={styles.field}>
        <span className={styles.label}>
          Tool name <Counter value={proposal.name} limit={BUDGETS.toolName} />
        </span>
        <input
          className={styles.input}
          value={proposal.name}
          disabled={approved}
          onChange={(event) => onChange({ ...proposal, name: event.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          What it does, for an agent to read{" "}
          <Counter value={proposal.description} limit={BUDGETS.toolDescription} />
        </span>
        <textarea
          className={styles.textarea}
          value={proposal.description}
          disabled={approved}
          onChange={(event) => onChange({ ...proposal, description: event.target.value })}
        />
      </label>

      <div className={styles.params}>
        {proposal.params.length === 0 ? (
          <p className={styles.note}>This tool takes no arguments.</p>
        ) : (
          proposal.params.map((param, index) => (
            <label className={styles.field} key={param.name}>
              <span className={styles.label}>
                {param.name}{" "}
                <span className={styles.paramMeta}>
                  {param.control.type}
                  {param.required ? ", required" : ", optional"}
                </span>{" "}
                <Counter value={param.description} limit={BUDGETS.paramDescription} />
              </span>
              <input
                className={styles.input}
                value={param.description}
                disabled={approved}
                onChange={(event) => {
                  const params = [...proposal.params];
                  params[index] = { ...param, description: event.target.value };
                  onChange({ ...proposal, params });
                }}
              />
            </label>
          ))
        )}
      </div>

      {blocked ? (
        <ul className={styles.blockers}>
          {proposal.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      {proposal.warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {proposal.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.consent}>
        <p className={styles.consentQuestion}>{proposal.consent.question}</p>
        {proposal.consent.choices.map((choice) => {
          const id = `${proposal.name}_${choice.checkpoint}`;
          return (
            <label
              key={choice.checkpoint}
              htmlFor={id}
              className={choice.available ? styles.choice : styles.choiceDisabled}
            >
              <input
                id={id}
                type="radio"
                name={`${proposal.name}_consent`}
                disabled={!choice.available || approved}
                checked={proposal.consent.choice === choice.checkpoint && proposal.consent.answered}
                onChange={() => setCheckpoint(choice.checkpoint)}
              />{" "}
              <span className={styles.choiceLabel}>{choice.label}</span>
              <span className={styles.choiceConsequence}>
                {choice.available ? choice.consequence : choice.unavailableReason}
              </span>
            </label>
          );
        })}
        {!proposal.consent.answered ? (
          <p className={styles.note}>
            Unanswered. Until you choose, the cautious option applies and no{" "}
            <code>toolautosubmit</code> is written.
          </p>
        ) : null}
      </div>

      <ul className={styles.reasons}>
        {proposal.reasons.map((reason) => (
          <li key={reason.reason}>
            <strong>{reason.route}:</strong> {reason.reason}
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button
          className={styles.small}
          type="button"
          disabled={approved}
          onClick={() => setRoute(proposal.route === "declarative" ? "imperative" : "declarative")}
        >
          Use {proposal.route === "declarative" ? "imperative" : "declarative"} instead
        </button>

        <button
          className={styles.small}
          type="button"
          disabled={approved || busy || !refineAvailable}
          onClick={onRefine}
          title={refineAvailable ? undefined : "Needs a model key on the server"}
        >
          {busy ? "Asking the model..." : "Improve the wording"}
        </button>

        {approved ? (
          <button className={styles.revoke} type="button" onClick={onRevoke}>
            Unregister
          </button>
        ) : (
          <button
            className={styles.approve}
            type="button"
            disabled={blocked || overBudget || violations.length > 0}
            onClick={onApprove}
            title={blocked ? "This form should not become a tool. See the reason above." : undefined}
          >
            {blocked ? "Cannot be approved" : "Approve and register"}
          </button>
        )}
      </div>

      {overBudget ? (
        <p className={styles.error}>
          Over a character budget. Shorten the fields marked in red before approving.
        </p>
      ) : null}

      {violations.length > 0 ? (
        <p className={styles.error}>
          {violations.map((violation) => `${violation.path}: ${violation.actual}/${violation.limit}`).join("; ")}
        </p>
      ) : null}

      {emission && "losses" in emission && emission.losses.length > 0 ? (
        <ul className={styles.losses}>
          {emission.losses.map((loss) => (
            <li key={loss}>{loss}</li>
          ))}
        </ul>
      ) : null}

      <details className={styles.emission}>
        <summary className={styles.label}>
          {proposal.route === "declarative" ? "Markup to paste back" : "Code to paste in"}
        </summary>
        <pre className={styles.code}>
          {proposal.route === "declarative"
            ? (declarative?.html ?? "Nothing emitted.")
            : (imperative?.code ?? "Nothing emitted.")}
        </pre>
      </details>

      {proposal.route === "declarative" && declarative ? (
        <details className={styles.emission}>
          <summary className={styles.label}>Schema the browser will build from it</summary>
          <pre className={styles.code}>{JSON.stringify(declarative.predictedSchema, null, 2)}</pre>
        </details>
      ) : null}
    </article>
  );
}
