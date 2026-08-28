# Spike 7 result: the generator against markup nobody chose for it (captured 2026-08-28, during M5)

Everything the generator had been tested on until now was a form I picked: the ChromeLabs
bistro demo and a sample I wrote. Both are tidy, both have ids, both declare a method.
So six real pages were fetched and run through cold.

| Page | Forms found | Outcome |
|---|---|---|
| httpbin.org/forms/post | 1 | `submit_order`, 7 params, imperative, clean |
| news.ycombinator.com/login | 2 | Both **blocked**: sign-in forms (see below) |
| gov.uk/search/all | 3 | Two searches correctly read-only, one feedback form mutating |
| en.wikipedia.org | 2 | Two searches, both treated as mutating (see below) |
| developer.mozilla.org | 0 | Correct: no `<form>` in the served HTML at all |
| w3.org | 0 | Correct: same |

Nothing crashed, nothing produced a budget violation, and the two zeroes are honest
rather than blind: neither MDN nor w3.org ships a `<form>`; their search is built
client-side. Three real problems came out of it.

## 1. A login form became a tool that cannot log in

Hacker News' login page has `<input type="text" name="acct">` and
`<input type="password" name="pw">`. The password is refused, correctly. What came out
was a tool named `login`, described as logging in, taking a username and nothing else.

An agent reading that description will call it, the call will do nothing useful, and
nothing in the tool explains why. Refusing the field was right; producing a weaker tool
from what was left was not. The right output for an authentication form is no tool.

This became `ToolProposal.blockers`, a list distinct from `warnings`: a warning informs,
a blocker means the proposal must not be approved as it stands. Any password field
blocks; a file input blocks, because it can never be filled from a schema and the form
would always submit empty. The review UI disables approval, and the export bundle skips
a blocked tool even if one somehow reaches it.

## 2. A form inside `<dialog>` was deleted entirely

`<dialog>` was in the sanitizer's drop-with-contents list, alongside `<iframe>` and
`<object>`. It does not belong there: it is an ordinary container, it cannot reach the
top layer without `showModal()`, and script is stripped long before anything renders.
Modal sign-in, search, and booking forms live inside one everywhere on the web, so this
silently reported "no forms" on a page that plainly has one.

`<dialog>`, `<details>`, and `<summary>` are now allowed. `<template>` stays dropped, and
that one is correct: its contents are inert, so no tool could act on them.

## 3. Wikipedia's search reads as mutating

Both Wikipedia search forms declare `action="/w/index.php"` and **no `method`**. The HTML
default is GET, but the analyzer only treats an *explicitly* declared `method="get"` as
evidence of a query, because a form with no method is usually handled in JavaScript and
could do anything. So Wikipedia's search is proposed as a state-changing tool and an
agent would be prompted before running it.

This is the conservative default behaving as designed, and it is the right way round:
marking a booking form read-only would let agents book without asking, while marking a
search mutating only costs a prompt. gov.uk declares `method="get"` on its search forms
and is correctly detected as read-only, which is the same rule working in the other
direction.

Worth revisiting only if a better signal appears. `role="search"`, which gov.uk sets, is
a candidate; Wikipedia does not set it, so it would not have helped here.

## Note on the corpus

These pages were fetched once, by hand, for a one-off parser test, and are not committed.
Anyone repeating this should fetch their own; the point of the exercise is markup the
generator has not already been shaped around.
