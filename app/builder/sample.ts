/**
 * A form to try the builder on.
 *
 * Deliberately not the bistro demo: that one arrives already annotated, which hides the
 * generator's actual job. This is plain markup with real constraints on it, so the
 * routing decision and the reported losses have something to bite on.
 */
export const SAMPLE_HTML = `<section>
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
</section>`;
