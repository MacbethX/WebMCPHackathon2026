/**
 * Live tool tests.
 *
 * The case that matters: a value the control refuses. Assigning an unmatched option to
 * a `<select>` leaves it blank and throws nothing, so a tool that does not read back
 * reports filling a field that is still empty. Found in the browser, with a real model
 * that answered "B" to a select whose options are "a", "b", "c".
 */

import { describe, expect, it } from "vitest";
import { buildLiveTool } from "@/lib/generator/live-tool";
import { generate } from "@/lib/generator/generate";
import type { CallToolResult } from "@/lib/webmcp/types";

const MARKUP = `<h2>Book a studio slot</h2>
  <form id="studioBooking" method="post">
    <label for="who">Your name</label>
    <input id="who" name="who" type="text" required minlength="2" maxlength="60">
    <label for="hours">Hours</label>
    <input id="hours" name="hours" type="number" min="1" max="8" required>
    <label for="room">Room</label>
    <select id="room" name="room" required>
      <option value="a">Room A</option>
      <option value="b">Room B</option>
    </select>
    <button type="submit">Request the slot</button>
  </form>`;

function mount() {
  document.body.innerHTML = MARKUP;
  const form = document.querySelector("form") as HTMLFormElement;
  const [generated] = generate(MARKUP);
  return { form, proposal: generated.proposal, tool: buildLiveTool(generated.proposal, () => form) };
}

const text = (result: CallToolResult) => result.content[0].text;
const signal = () => new AbortController().signal;

describe("the schema the agent is given", () => {
  it("carries the select's real options, not a bare string", () => {
    const { tool } = mount();
    const room = tool.inputSchema!.properties!.room;

    // The bug this prevents: told only "string", a model answers "B" and the write
    // silently fails against options "a" and "b".
    expect(room.oneOf).toEqual([
      { const: "a", title: "Room A" },
      { const: "b", title: "Room B" },
    ]);
  });

  it("carries length and range constraints too", () => {
    const { tool } = mount();
    const properties = tool.inputSchema!.properties!;

    expect(properties.who).toMatchObject({ minLength: 2, maxLength: 60 });
    expect(properties.hours).toMatchObject({ type: "number", minimum: 1, maximum: 8 });
  });
});

describe("filling the form", () => {
  it("writes values the controls accept", async () => {
    const { form, tool } = mount();

    const result = await tool.execute({ who: "Marguerite", hours: "3", room: "b" }, { signal: signal() });

    expect(form.elements.namedItem("who")).toHaveValue("Marguerite");
    expect((form.elements.namedItem("room") as HTMLSelectElement).value).toBe("b");
    expect(result.isError).toBeUndefined();
    expect(text(result)).toContain("Filled the");
  });

  it("reports a value the control refused, instead of claiming it was filled", async () => {
    const { form, tool } = mount();

    // "B" is not one of the options. The select stays empty.
    const result = await tool.execute({ who: "Marguerite", room: "B" }, { signal: signal() });

    expect((form.elements.namedItem("room") as HTMLSelectElement).value).toBe("");
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Partly filled");
    expect(text(result)).toContain("room would not take");
    expect(text(result)).not.toMatch(/^Filled the/);
  });

  it("reports a field that is not on the form at all", async () => {
    const { tool } = mount();
    const result = await tool.execute({ who: "Marguerite", nonsense: "x" }, { signal: signal() });

    // `nonsense` is not a declared parameter, so it is simply not written.
    expect(text(result)).toContain("Filled the");
    expect(text(result)).toContain("who: Marguerite");
  });

  it("errors when nothing could be written, and says why", async () => {
    const { tool } = mount();
    const result = await tool.execute({ room: "nope" }, { signal: signal() });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Nothing was filled in");
    expect(text(result)).toContain("room would not take");
  });

  it("says so when the form has gone away", async () => {
    const [generated] = generate(MARKUP);
    const tool = buildLiveTool(generated.proposal, () => null);

    const result = await tool.execute({ who: "Marguerite" }, { signal: signal() });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not on the page");
  });

  it("never claims to have submitted anything", async () => {
    const { tool } = mount();
    const result = await tool.execute({ who: "Marguerite" }, { signal: signal() });

    expect(text(result)).toContain("nothing was submitted anywhere");
  });
});
