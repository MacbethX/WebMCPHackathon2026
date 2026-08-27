# Spike 6 result: consent and reset on a declarative form (Chrome 151, captured 2026-08-27 during M2)

Driving `sign_guestbook`, the declarative tool on the sandbox guestbook form, through
`document.modelContext.executeTool`. The form has no `toolautosubmit`, so the browser
fills it and waits for a person to press the button.

Confirmed working: the browser filled both fields, and both pseudo-classes fired. The
form took its `:tool-form-active` outline and the submit button took
`:tool-submit-active`. That settles the open half of spike 3: Lightning CSS warns about
these selectors but the styling reaches the browser and works.

## Finding 1: agentInvoked is true even when a person submits

`SubmitEvent.agentInvoked` is true on a form the agent filled, regardless of who pressed
the button. It marks the *origin of the invocation*, not the origin of the submission.

This breaks the obvious consent design. Gating on `agentInvoked` prompts a second time,
immediately after the human check the platform already enforced by declining to submit
the form on its own. Two prompts for one action trains people to click through both.

The attribute that actually decides whether a human was in the loop is `toolautosubmit`:

| Form | Who submits | Who should gate |
|---|---|---|
| No `toolautosubmit` | A person, after seeing the filled form | The platform already did. Record the press as the consent |
| `toolautosubmit` | The agent, unattended | Us. Nothing else is standing there |

So the test is `agentInvoked && autoSubmit`, implemented as `formSubmissionNeedsConsent`
in `lib/webmcp/consent-gate.tsx`. Toolsmith records the attended case as
`human-submitted` rather than inventing an approval that never happened.

Consequence for the generator (M4): whether to emit `toolautosubmit` is not a
convenience toggle, it is the consent decision for that tool. The review UI has to
present it that way, not as a checkbox labelled "submit automatically".

## Finding 2: resetting the form cancels the invocation, and the agent sees the cancel

Calling `form.reset()` while the declarative invocation is live rejects the agent's call:

```
UnknownError: Tool execution cancelled by a form reset
```

The explainer documents reset as one of the things that ends a running declarative tool.
What is easy to miss is the ordering trap: resetting inside the handler after the write
succeeds still lands *before* the `respondWith` promise is delivered. The write happened,
the receipt was written, the person saw the confirmation, and the agent was told the call
was cancelled. Silent divergence between what the page did and what the agent believes.

Fix: flag the reset, attach the cleanup with `work.finally` *after* calling
`respondWith`, and defer the actual reset to a macrotask with `setTimeout(..., 0)`, so the
browser has consumed the result first. Verified: the agent now resolves with
`Signed the guestbook as Otto.` and the form still clears.

Any emitted declarative handler that clears its form needs this same shape.
