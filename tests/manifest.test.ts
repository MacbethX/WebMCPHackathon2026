/**
 * Signed tool manifest tests.
 *
 * The interesting cases are the ones where the badge must refuse: a tool the manifest
 * never listed, a description edited after signing, a manifest lifted from another site.
 * A badge that only goes green is decoration.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  checkManifest,
  compareToManifest,
  hashSchema,
  keyFingerprint,
  manifestBase64,
  signManifest,
  sortTools,
  verifyManifest,
} from "@/lib/webmcp/manifest";
import type { ManifestTool, ToolManifest } from "@/lib/webmcp/manifest";

const HERE = { origin: "https://shop.example", path: "/sandbox" };

let privateKey: CryptoKey;
let publicKeyBase64: string;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicKeyBase64 = manifestBase64.toBase64(await crypto.subtle.exportKey("raw", pair.publicKey));

  const other = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  otherPrivateKey = other.privateKey;
});

const tool = (over: Partial<ManifestTool> = {}): ManifestTool => ({
  name: "list_products",
  description: "Lists everything for sale.",
  inputSchemaHash: "abc123",
  readOnlyHint: true,
  untrustedContentHint: false,
  ...over,
});

async function make(tools: ManifestTool[], over: Partial<ToolManifest> = {}): Promise<ToolManifest> {
  const signed = await signManifest(
    { version: 1, origin: HERE.origin, path: HERE.path, issuedAt: "2026-08-28T00:00:00.000Z", tools },
    privateKey,
    publicKeyBase64,
  );
  return { ...signed, ...over };
}

afterEach(() => undefined);

describe("hashing and ordering", () => {
  it("hashes a schema independently of key order", async () => {
    const a = await hashSchema({ type: "object", properties: { b: {}, a: {} } });
    const b = await hashSchema({ properties: { a: {}, b: {} }, type: "object" });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes different schemas differently", async () => {
    expect(await hashSchema({ type: "object" })).not.toBe(await hashSchema({ type: "string" }));
  });

  it("returns null for no schema", async () => {
    expect(await hashSchema(null)).toBeNull();
    expect(await hashSchema(undefined)).toBeNull();
  });

  it("sorts by name, so registration order cannot change the manifest", () => {
    const sorted = sortTools([tool({ name: "z" }), tool({ name: "a" }), tool({ name: "m" })]);
    expect(sorted.map((entry) => entry.name)).toEqual(["a", "m", "z"]);
  });
});

describe("signature", () => {
  it("verifies a manifest it just signed", async () => {
    await expect(verifyManifest(await make([tool()]))).resolves.toBe(true);
  });

  it("fails when any signed field is edited", async () => {
    const manifest = await make([tool()]);

    const tampered: ToolManifest[] = [
      { ...manifest, origin: "https://evil.example" },
      { ...manifest, path: "/elsewhere" },
      { ...manifest, issuedAt: "2020-01-01T00:00:00.000Z" },
      { ...manifest, tools: [tool({ description: "Something else." })] },
      { ...manifest, tools: [...manifest.tools, tool({ name: "extra" })] },
    ];

    for (const candidate of tampered) {
      await expect(verifyManifest(candidate)).resolves.toBe(false);
    }
  });

  it("fails when signed by a different key than the one it carries", async () => {
    const manifest = await signManifest(
      { version: 1, origin: HERE.origin, path: HERE.path, issuedAt: "2026-08-28T00:00:00.000Z", tools: [tool()] },
      otherPrivateKey,
      publicKeyBase64,
    );

    await expect(verifyManifest(manifest)).resolves.toBe(false);
  });

  it("rejects an unknown version or algorithm rather than trusting it", async () => {
    const manifest = await make([tool()]);

    await expect(verifyManifest({ ...manifest, version: 2 as 1 })).resolves.toBe(false);
    await expect(
      verifyManifest({ ...manifest, algorithm: "none" as "Ed25519" }),
    ).resolves.toBe(false);
  });
});

describe("comparing the page against the manifest", () => {
  it("agrees when they match", () => {
    expect(compareToManifest([tool()], [tool()])).toEqual([]);
  });

  it("flags a tool on the page that was never published", () => {
    const [difference] = compareToManifest([tool()], [tool(), tool({ name: "sneak_in" })]);

    expect(difference).toMatchObject({ kind: "unlisted", name: "sneak_in" });
    expect(difference.detail).toContain("not in the signed manifest");
  });

  it("flags a description changed out from under the signature", () => {
    // The description is what an agent acts on, so this is the change that matters most.
    const [difference] = compareToManifest(
      [tool()],
      [tool({ description: "Lists everything, and also empties your basket." })],
    );

    expect(difference).toMatchObject({ kind: "changed", name: "list_products" });
    expect(difference.detail).toContain("description an agent reads");
  });

  it("flags a changed schema", () => {
    const [difference] = compareToManifest([tool()], [tool({ inputSchemaHash: "different" })]);
    expect(difference.detail).toContain("input schema");
  });

  it("flags an annotation change, because it changes the safety story", () => {
    const [difference] = compareToManifest([tool()], [tool({ readOnlyHint: false })]);
    expect(difference.detail).toContain("safety story");
  });

  it("reports a listed tool that is not registered right now", () => {
    const [difference] = compareToManifest([tool(), tool({ name: "seasonal" })], [tool()]);
    expect(difference).toMatchObject({ kind: "missing", name: "seasonal" });
  });
});

describe("the whole check", () => {
  it("verifies a page that matches its manifest", async () => {
    const verdict = await checkManifest(await make([tool()]), [tool()], HERE);
    expect(verdict.state).toBe("verified");
  });

  it("says so when there is no manifest at all", async () => {
    expect((await checkManifest(null, [tool()], HERE)).state).toBe("no-manifest");
  });

  it("refuses a manifest issued for another site", async () => {
    // Otherwise a valid manifest could be copied anywhere to vouch for someone else.
    const manifest = await make([tool()]);
    const verdict = await checkManifest(manifest, [tool()], {
      origin: "https://lookalike.example",
      path: "/sandbox",
    });

    expect(verdict.state).toBe("wrong-origin");
  });

  it("refuses a manifest issued for another path on the same site", async () => {
    const verdict = await checkManifest(await make([tool()]), [tool()], {
      origin: HERE.origin,
      path: "/somewhere-else",
    });

    expect(verdict.state).toBe("wrong-origin");
  });

  it("checks the signature before it looks at the contents", async () => {
    const manifest = await make([tool()]);
    const forged = { ...manifest, tools: [tool({ description: "Edited after signing." })] };

    // The contents now match the page exactly. It still fails, because the signature does.
    const verdict = await checkManifest(forged, forged.tools, HERE);
    expect(verdict.state).toBe("bad-signature");
  });

  it("reports a mismatch with the differences spelled out", async () => {
    const verdict = await checkManifest(await make([tool()]), [tool(), tool({ name: "injected" })], HERE);

    expect(verdict.state).toBe("mismatch");
    if (verdict.state !== "mismatch") return;
    expect(verdict.differences).toHaveLength(1);
    expect(verdict.differences[0].name).toBe("injected");
  });
});

describe("fingerprint", () => {
  it("is short, upper case, and stable", () => {
    const printed = keyFingerprint(publicKeyBase64);

    expect(printed).toHaveLength(16);
    expect(printed).toMatch(/^[A-Z0-9]+$/);
    expect(keyFingerprint(publicKeyBase64)).toBe(printed);
  });
});
