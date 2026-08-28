/**
 * Forms to try the builder on.
 *
 * Not a showcase. Each one is here because it makes the generator do something it
 * otherwise only argues for in prose: route a form one way rather than the other, refuse
 * to build a tool at all, or handle two forms that want the same name. Someone who lands
 * here with no HTML to paste should be able to see what it actually reasons about.
 *
 * Deliberately not the ChromeLabs bistro demo. That one arrives already annotated, which
 * hides the work.
 */

export interface BuilderExample {
  id: string;
  label: string;
  /** What this one demonstrates, shown next to the button. */
  demonstrates: string;
  html: string;
}

export const EXAMPLES: readonly BuilderExample[] = [
  {
    id: "booking",
    label: "Studio booking",
    demonstrates:
      "The ordinary case. Real constraints on the fields, so it routes imperative and says why.",
    html: `<section>
  <h2>Book a studio slot</h2>
  <form id="studioBooking" method="post">
    <label for="who">Your name</label>
    <input id="who" name="who" type="text" required minlength="2" maxlength="60" placeholder="Marguerite">

    <label for="email">Email</label>
    <input id="email" name="email" type="email" required>

    <label for="day">Day</label>
    <input id="day" name="day" type="date" required min="2026-01-01">

    <label for="start">Start time</label>
    <input id="start" name="start" type="time" required>

    <label for="hours">Hours</label>
    <input id="hours" name="hours" type="number" min="1" max="8" required>

    <label for="room">Room</label>
    <select id="room" name="room" required>
      <option value="a">Room A, the loud one</option>
      <option value="b">Room B, the quiet one</option>
      <option value="c">Room C, no windows</option>
    </select>

    <label for="notes">Anything we should know</label>
    <textarea id="notes" name="notes" rows="2" maxlength="200"></textarea>

    <button type="submit">Request the slot</button>
  </form>
</section>`,
  },
  {
    id: "search",
    label: "Site search",
    demonstrates:
      "An explicit method=\"get\", so it is read-only. That changes the annotations and the consent question.",
    html: `<section>
  <h2>Search the archive</h2>
  <form id="archiveSearch" method="get" action="/search">
    <label for="q">What are you looking for</label>
    <input id="q" name="q" type="search" required>

    <label for="since">Published since</label>
    <input id="since" name="since" type="date">

    <label for="sort">Order</label>
    <select id="sort" name="sort">
      <option value="relevance">Most relevant</option>
      <option value="newest">Newest first</option>
    </select>

    <button type="submit">Search</button>
  </form>
</section>`,
  },
  {
    id: "signin",
    label: "Sign-in form",
    demonstrates:
      "Refused. The password is never exposed, so any tool from this form would claim to sign in and be unable to.",
    html: `<section>
  <h2>Sign in</h2>
  <form id="signin" method="post" action="/login">
    <label for="acct">Username</label>
    <input id="acct" name="acct" type="text" required>

    <label for="pw">Password</label>
    <input id="pw" name="pw" type="password" required>

    <button type="submit">Sign in</button>
  </form>
</section>`,
  },
  {
    id: "twoforms",
    label: "Two forms, one label",
    demonstrates:
      "Both submit buttons say \"Sign up\". Two tools cannot share a name, so the second is numbered.",
    html: `<section>
  <h2>Newsletter</h2>
  <form id="newsletter" method="post">
    <label for="news-email">Email</label>
    <input id="news-email" name="email" type="email" required>
    <button type="submit">Sign up</button>
  </form>
</section>
<section>
  <h2>Waitlist</h2>
  <form id="waitlist" method="post">
    <label for="wait-email">Email</label>
    <input id="wait-email" name="email" type="email" required>
    <label for="wait-name">Name</label>
    <input id="wait-name" name="name" type="text" maxlength="80">
    <button type="submit">Sign up</button>
  </form>
</section>`,
  },
];
