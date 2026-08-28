/**
 * Sanitizer tests.
 *
 * The builder renders pasted markup inside our origin, next to the ledger's signing key.
 * These are the tests where a pass means "the attack did not work", so they are written
 * as attacks rather than as features.
 */

import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/generator/sanitize";

const clean = (html: string) => sanitizeHtml(html).html;

describe("script execution", () => {
  it("removes script elements and their source", () => {
    const result = sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>');

    expect(result.html).not.toContain("script");
    expect(result.html).not.toContain("alert");
    expect(result.html).toContain("before");
    expect(result.html).toContain("after");
    expect(result.removed).toContain("<script> and its contents");
  });

  it("removes every event handler attribute", () => {
    for (const handler of ["onclick", "onerror", "onload", "onfocus", "onmouseover", "ONCLICK"]) {
      const html = clean(`<div ${handler}="steal()">x</div>`);
      expect(html.toLowerCase()).not.toContain("steal");
      expect(html.toLowerCase()).not.toContain(handler.toLowerCase());
    }
  });

  it("removes an event handler on an element it otherwise keeps", () => {
    const html = clean('<input name="a" onfocus="steal()">');

    expect(html).toContain('name="a"');
    expect(html).not.toContain("onfocus");
  });

  it("strips the classic img onerror payload", () => {
    const html = clean('<img src="x" onerror="alert(1)">');

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert");
  });
});

describe("navigation and URLs", () => {
  it("rejects javascript: hrefs", () => {
    expect(clean('<a href="javascript:alert(1)">go</a>')).not.toContain("javascript");
  });

  it("rejects javascript: obfuscated with control characters", () => {
    // Tabs and newlines inside the scheme are the classic way past a naive check.
    expect(clean('<a href="java\tscript:alert(1)">go</a>')).not.toContain("script:");
    expect(clean('<a href="java\nscript:alert(1)">go</a>')).not.toContain("script:");
    expect(clean('<a href=" JaVaScRiPt:alert(1)">go</a>').toLowerCase()).not.toContain("javascript");
  });

  it("rejects data: and vbscript: URLs", () => {
    expect(clean('<a href="data:text/html,<script>alert(1)</script>">x</a>')).not.toContain("data:");
    expect(clean('<a href="vbscript:msgbox">x</a>')).not.toContain("vbscript");
  });

  it("keeps ordinary URLs and adds rel to links", () => {
    const html = clean('<a href="https://example.com/page">x</a>');

    expect(html).toContain('href="https://example.com/page"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("strips action, formaction, and target so the preview cannot navigate", () => {
    const html = clean(
      '<form action="https://evil.test" target="_top"><button formaction="https://evil.test">Go</button></form>',
    );

    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("action=");
    expect(html).not.toContain("target=");
  });
});

describe("embedding and overlay", () => {
  it("removes iframes, objects, and embeds with their contents", () => {
    const html = clean(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="y">',
    );

    expect(html).not.toContain("iframe");
    expect(html).not.toContain("object");
    expect(html).not.toContain("embed");
  });

  it("removes style elements and inline styles, which can cover the real page", () => {
    const html = clean(
      '<style>body{display:none}</style><div style="position:fixed;inset:0;z-index:9999">x</div>',
    );

    expect(html).not.toContain("style");
    expect(html).not.toContain("position:fixed");
  });

  it("removes base and meta, which redirect or rewrite every other URL", () => {
    const html = clean('<base href="https://evil.test/"><meta http-equiv="refresh" content="0">');

    expect(html).not.toContain("base");
    expect(html).not.toContain("meta");
  });
});

describe("what it keeps", () => {
  it("keeps a form intact, with its constraints", () => {
    const html = clean(
      '<form id="f" method="post"><label for="n">Name</label>' +
        '<input id="n" name="name" required minlength="2" maxlength="40" pattern="[a-z]+">' +
        '<select name="s"><option value="1">One</option></select>' +
        '<textarea name="t" rows="3"></textarea>' +
        "<button type=\"submit\">Go</button></form>",
    );

    expect(html).toContain('id="f"');
    expect(html).toContain('minlength="2"');
    expect(html).toContain('maxlength="40"');
    expect(html).toContain('pattern="[a-z]+"');
    expect(html).toContain("<option");
    expect(html).toContain("<textarea");
    expect(html).toContain("<button");
  });

  it("keeps method, which is how a query is told from a change", () => {
    // Stripping it would make every pasted form look mutating, and a GET search form
    // would never get readOnlyHint. Safe with `action` gone: method alone navigates
    // nowhere.
    const html = clean('<form method="get" action="https://evil.test"><input name="q"></form>');

    expect(html).toContain('method="get"');
    expect(html).not.toContain("evil.test");
  });

  it("keeps existing WebMCP annotations, so annotated markup survives a round trip", () => {
    const html = clean(
      '<form toolname="book" tooldescription="Books a table" toolautosubmit>' +
        '<input name="n" toolparamdescription="Who is booking"></form>',
    );

    expect(html).toContain('toolname="book"');
    expect(html).toContain('tooldescription="Books a table"');
    expect(html).toContain('toolparamdescription="Who is booking"');
    expect(html).toContain("toolautosubmit");
  });

  it("unwraps an unknown element rather than losing the form inside it", () => {
    const html = clean("<custom-widget><form id=\"inner\"><input name=\"a\"></form></custom-widget>");

    expect(html).not.toContain("custom-widget");
    expect(html).toContain('id="inner"');
    expect(html).toContain('name="a"');
  });

  it("keeps data attributes and accessibility attributes", () => {
    const html = clean('<div data-id="7" aria-label="Section" role="group">x</div>');

    expect(html).toContain('data-id="7"');
    expect(html).toContain('aria-label="Section"');
    expect(html).toContain('role="group"');
  });
});

describe("edge cases", () => {
  it("handles empty and whitespace input without throwing", () => {
    expect(sanitizeHtml("").html).toBe("");
    expect(sanitizeHtml("   ").html.trim()).toBe("");
  });

  it("handles a fragment with no form", () => {
    expect(clean("<p>Just prose.</p>")).toContain("Just prose.");
  });

  it("handles malformed markup the way a browser does, without throwing", () => {
    expect(() => sanitizeHtml("<form><div><input name=a></form></div>")).not.toThrow();
  });

  it("reports what it removed, so nothing disappears silently", () => {
    const { removed } = sanitizeHtml('<script>x</script><div onclick="y">z</div>');

    expect(removed.length).toBeGreaterThan(0);
    expect(removed.join(" ")).toContain("script");
    expect(removed.join(" ")).toContain("onclick");
  });

  it("is idempotent: sanitizing clean output changes nothing", () => {
    const once = clean('<form id="f"><input name="a" required></form>');
    expect(clean(once)).toBe(once);
  });
});
