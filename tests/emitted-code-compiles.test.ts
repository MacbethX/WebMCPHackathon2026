/**
 * The emitted code compiles.
 *
 * Every other generator test checks what the output contains. This one checks that it
 * works: the module is written to disk and run through the real TypeScript compiler in
 * strict mode, with `webmcp-types` in scope and nothing else. A generator whose output
 * does not compile is a generator that wastes the time of everyone who trusts it, and no
 * amount of string assertions catches a missing brace.
 *
 * Slower than the rest of the suite because it spawns tsc. Worth it: this is the
 * deliverable.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generate } from "@/lib/generator/generate";

const REPO = process.cwd();
const TSC = join(REPO, "node_modules/.bin/tsc");
const workspace = mkdtempSync(join(tmpdir(), "toolsmith-emit-"));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

/** Compiles one emitted module on its own. Returns compiler output, empty when clean. */
function compile(code: string, filename: string): string {
  const modulePath = join(workspace, filename);
  const configPath = join(workspace, `${filename}.tsconfig.json`);

  writeFileSync(modulePath, code);
  writeFileSync(
    configPath,
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        lib: ["dom", "esnext"],
        strict: true,
        noEmit: true,
        module: "esnext",
        moduleResolution: "bundler",
        types: ["webmcp-types"],
        typeRoots: [join(REPO, "node_modules")],
      },
      include: [filename],
    }),
  );

  try {
    execFileSync(TSC, ["-p", configPath], { encoding: "utf8", stdio: "pipe" });
    return "";
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
  }
}

const bistroHtml = () =>
  readFileSync(join(REPO, "research/raw/demos/french-bistro_index.html"), "utf8");

describe("emitted imperative modules compile under strict TypeScript", () => {
  it("compiles the module generated from the bistro form", () => {
    const [generated] = generate(bistroHtml());
    expect(compile(generated.imperative!.code, "bistro.ts")).toBe("");
  }, 90_000);

  it("compiles a read-only tool, which takes a different branch", () => {
    const [generated] = generate(
      '<h2>Search</h2><form id="s" method="get"><label for="q">Query</label>' +
        '<input id="q" name="q"><button type="submit">Search</button></form>',
    );

    expect(generated.proposal.annotations.readOnlyHint).toBe(true);
    expect(generated.imperative!.code).toContain("annotations: { readOnlyHint: true }");
    // A read-only tool emits no approval stub, so this exercises the other path.
    expect(generated.imperative!.code).not.toContain("requestApproval");
    expect(compile(generated.imperative!.code, "search.ts")).toBe("");
  }, 90_000);

  it("compiles a tool with numbers, booleans, and a grouped radio set", () => {
    const [generated] = generate(
      '<h2>Order</h2><form id="o" method="post">' +
        '<label for="qty">Quantity</label><input id="qty" type="number" name="qty" min="1" max="9" required>' +
        '<label for="gift">Gift wrap</label><input id="gift" type="checkbox" name="gift" value="yes">' +
        '<label for="r1">Standard</label><input id="r1" type="radio" name="speed" value="std" required>' +
        '<label for="r2">Express</label><input id="r2" type="radio" name="speed" value="exp">' +
        "<button type=\"submit\">Place order</button></form>",
    );

    const properties = generated.imperative!.schema.properties!;
    expect(properties.qty).toMatchObject({ type: "number", minimum: 1, maximum: 9 });
    expect(properties.gift.type).toBe("boolean");
    expect(properties.speed.oneOf).toEqual([
      { const: "std", title: "Standard" },
      { const: "exp", title: "Express" },
    ]);

    expect(compile(generated.imperative!.code, "order.ts")).toBe("");
  }, 90_000);
});
