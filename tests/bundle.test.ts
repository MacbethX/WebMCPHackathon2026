/**
 * Export bundle tests.
 *
 * The archive is written out and handed to the real `unzip` binary. A hand-rolled ZIP
 * that only its own reader accepts is not a ZIP, and no amount of asserting on byte
 * offsets would catch that. `unzip -t` checks the CRCs; `unzip -p` proves the contents
 * survive the round trip.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildBundle, bundleFileName, bundleFiles } from "@/lib/generator/bundle";
import { generate } from "@/lib/generator/generate";
import { answerConsent } from "@/lib/generator/consent-design";
import { crc32, createZip } from "@/lib/generator/zip";

const workspace = mkdtempSync(join(tmpdir(), "toolsmith-zip-"));
const STAMP = new Date("2026-08-28T12:00:00Z");

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

/** Writes the archive and returns a path, for handing to the system unzip. */
function write(name: string, bytes: Uint8Array): string {
  const path = join(workspace, name);
  writeFileSync(path, bytes);
  return path;
}

const unzip = (args: string[]) => execFileSync("unzip", args, { encoding: "utf8" });

const SAMPLE = `<h2>Book a studio slot</h2>
  <form id="studioBooking" method="post">
    <label for="who">Your name</label>
    <input id="who" name="who" type="text" required minlength="2" maxlength="60">
    <label for="room">Room</label>
    <select id="room" name="room" required>
      <option value="a">Room A</option>
      <option value="b">Room B</option>
    </select>
    <button type="submit">Request the slot</button>
  </form>`;

describe("crc32", () => {
  it("matches the known value for a standard input", () => {
    // The canonical CRC-32 check value for "123456789".
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("the archive is a real archive", () => {
  it("passes unzip's own integrity check", () => {
    const path = write(
      "basic.zip",
      createZip([{ path: "hello.txt", content: "hello" }], STAMP),
    );

    expect(unzip(["-t", path])).toContain("No errors detected");
  });

  it("round-trips contents byte for byte, including UTF-8", () => {
    const content = "Réservation: café, naïve, 日本語, emoji 🦆\nsecond line\n";
    const path = write("utf8.zip", createZip([{ path: "notes.md", content }], STAMP));

    expect(unzip(["-p", path, "notes.md"])).toBe(content);
  });

  it("holds several files in nested paths", () => {
    const path = write(
      "many.zip",
      createZip(
        [
          { path: "README.md", content: "# top" },
          { path: "tools/one.ts", content: "export const one = 1;\n" },
          { path: "tools/two.html", content: "<form></form>\n" },
        ],
        STAMP,
      ),
    );

    const listing = unzip(["-l", path]);
    expect(listing).toContain("README.md");
    expect(listing).toContain("tools/one.ts");
    expect(listing).toContain("tools/two.html");
    expect(unzip(["-p", path, "tools/one.ts"])).toBe("export const one = 1;\n");
  });

  it("produces a well-formed archive even with nothing in it", () => {
    // 22 bytes: an end-of-central-directory record and nothing else, which is what an
    // empty ZIP is. unzip exits 1 and says "zipfile is empty" rather than reporting
    // corruption, which is the distinction being checked. The bundle is never actually
    // empty, since the docs are always written.
    const path = write("empty.zip", createZip([], STAMP));

    let output = "";
    try {
      output = unzip(["-t", path]);
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? "");
    }

    expect(output).toContain("zipfile is empty");
    expect(output).not.toContain("cannot find");
  });

  it("is deterministic: the same entries and stamp give the same bytes", () => {
    const entries = [{ path: "a.txt", content: "a" }];
    expect(createZip(entries, STAMP)).toEqual(createZip(entries, STAMP));
  });
});

describe("the bundle", () => {
  const generated = () => generate(SAMPLE);

  it("carries the docs, the manifest, and one file per tool", () => {
    const paths = bundleFiles({ tools: generated(), generatedAt: STAMP }).map((file) => file.path);

    expect(paths).toContain("README.md");
    expect(paths).toContain("CONSENT.md");
    expect(paths).toContain("manifest.json");
    expect(paths.some((path) => path.startsWith("tools/"))).toBe(true);
  });

  it("unzips, and the emitted module survives intact", () => {
    const tools = generated();
    const path = write("bundle.zip", buildBundle({ tools, generatedAt: STAMP }));

    expect(unzip(["-t", path])).toContain("No errors detected");

    const name = tools[0].proposal.name;
    const emitted = unzip(["-p", path, `tools/${name}.ts`]);
    expect(emitted).toContain("document.modelContext");
    expect(emitted).toContain(`name: ${JSON.stringify(name)}`);
  });

  it("records the consent decision, and says when it was never answered", () => {
    const path = write("consent.zip", buildBundle({ tools: generated(), generatedAt: STAMP }));
    const consent = unzip(["-p", path, "CONSENT.md"]);

    expect(consent).toContain("Not answered");
    expect(consent).toContain("`toolautosubmit` written: no");
  });

  it("records an answered decision as answered", () => {
    const tools = generated();
    tools[0].proposal.consent = answerConsent(tools[0].proposal.consent, "person-approves");

    const path = write("answered.zip", buildBundle({ tools, generatedAt: STAMP }));
    const consent = unzip(["-p", path, "CONSENT.md"]);

    expect(consent).toContain("A person approves a prompt");
    expect(consent).not.toContain("Not answered");
  });

  it("writes a manifest that parses, naming every file it claims", () => {
    const path = write("manifest.zip", buildBundle({ tools: generated(), generatedAt: STAMP }));
    const parsed = JSON.parse(unzip(["-p", path, "manifest.json"])) as {
      tools: Array<{ name: string; file: string; consent: { answered: boolean } }>;
    };

    expect(parsed.tools).toHaveLength(1);
    for (const tool of parsed.tools) {
      expect(() => unzip(["-p", path, tool.file])).not.toThrow();
      expect(tool.consent.answered).toBe(false);
    }
  });

  it("skips a tool that emitted nothing rather than shipping an empty file", () => {
    const tools = generated();
    const emptied = [{ ...tools[0], imperative: null, declarative: null }];

    const paths = bundleFiles({ tools: emptied, generatedAt: STAMP }).map((file) => file.path);
    expect(paths.some((path) => path.startsWith("tools/"))).toBe(false);
  });

  it("stamps the filename so successive exports do not overwrite", () => {
    expect(bundleFileName(STAMP)).toBe("toolsmith-tools-2026-08-28-12-00-00.zip");
  });
});
