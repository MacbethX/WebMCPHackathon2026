/**
 * Signs the sandbox's tool manifest.
 *
 *   npm run sign-manifest
 *
 * Reads the signing key from TOOLSMITH_SIGNING_KEY (base64 PKCS#8). If none is set it
 * generates one, prints it, and stops without writing: a manifest signed by a key that
 * only existed for one run proves nothing on the next deploy, and silently minting a new
 * identity every build is worse than refusing.
 *
 * The private key never enters the repository. The public key is written into the
 * manifest, which is what the badge verifies against, with the honest limits on what
 * that proves spelled out in lib/webmcp/manifest.ts.
 *
 * This is deliberately a separate command rather than part of `build`. Signing is an act
 * of publication: it should happen because someone decided to publish, not as a side
 * effect of compiling.
 */

import { webcrypto as crypto } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "public", "sandbox-tools.manifest.json");

const ORIGIN = process.env.MANIFEST_ORIGIN ?? "https://web-mcp-hackathon2026.vercel.app";
const PATH = "/sandbox";

/**
 * The sandbox's tools, as its author declares them.
 *
 * Written out here rather than imported from the app, on purpose. A manifest generated
 * by running the same code it is meant to check would agree with a compromised build as
 * readily as an honest one. This is a statement about what the page is supposed to
 * offer, and it has to be able to disagree with what the page actually does.
 *
 * Schema hashes come from the canonical JSON of each tool's inputSchema. Keep in step
 * with app/sandbox/tools.ts and the guestbook form; the badge reports a mismatch loudly
 * if they drift, which is the point.
 */
const TOOLS = [
  {
    name: "add_to_guestbook",
    description:
      "Signs the shop's guestbook with a short public message. This changes the page: the entry appears immediately and is visible to everyone who visits. Ask the person before calling it.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Who is signing. 1 to 40 characters.", minLength: 1, maxLength: 40 },
        message: {
          type: "string",
          description: "The message to leave. 1 to 280 characters.",
          minLength: 1,
          maxLength: 280,
        },
      },
      required: ["name", "message"],
      additionalProperties: false,
    },
    readOnlyHint: false,
    untrustedContentHint: true,
  },
  {
    name: "list_products",
    description:
      "Lists everything for sale in this shop, with prices in US dollars. Optionally filters to items at or below a price. Read-only: it never changes anything.",
    inputSchema: {
      type: "object",
      properties: {
        max_price: {
          type: "number",
          description: "Only list items at or below this price, in US dollars.",
          minimum: 0,
        },
      },
      required: [],
      additionalProperties: false,
    },
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  {
    name: "sign_guestbook",
    description:
      "Signs the guestbook of Andrew's Curio Shelf with a short public message. Changes the page: the entry becomes visible to every visitor.",
    // Synthesized by the browser from the form. Matches what spike 4 captured.
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Who is signing the guestbook. 1 to 40 characters." },
        message: { type: "string", description: "The public message to leave. 1 to 280 characters." },
      },
      required: ["name", "message"],
    },
    readOnlyHint: false,
    untrustedContentHint: false,
  },
];

/** Deterministic JSON with sorted keys. Must match lib/webmcp/receipt-ledger.ts. */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
  return `{${entries.join(",")}}`;
}

const toBase64 = (buffer) => Buffer.from(buffer).toString("base64");

async function hashSchema(schema) {
  if (schema === null || schema === undefined) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(schema)));
  return Buffer.from(digest).toString("hex");
}

async function loadKeys() {
  const stored = process.env.TOOLSMITH_SIGNING_KEY?.trim();

  if (!stored) {
    const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const raw = await crypto.subtle.exportKey("raw", pair.publicKey);

    console.error("No TOOLSMITH_SIGNING_KEY is set, so nothing was signed.\n");
    console.error("A key was generated for you. Save the private half somewhere safe and");
    console.error("out of the repository, then run this again:\n");
    console.error(`TOOLSMITH_SIGNING_KEY=${toBase64(pkcs8)}\n`);
    console.error(`Its public fingerprint, for checking a badge out of band:`);
    console.error(`  ${toBase64(raw).replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase()}\n`);
    process.exit(1);
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(stored, "base64"),
    "Ed25519",
    true,
    ["sign"],
  );

  // Ed25519 pkcs8 carries the public key, but WebCrypto will not hand it back, so it is
  // derived by exporting the private key as JWK and reading the x coordinate.
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicKey = Buffer.from(jwk.x.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  return { privateKey, publicKeyBase64: publicKey.toString("base64") };
}

const { privateKey, publicKeyBase64 } = await loadKeys();

const tools = (
  await Promise.all(
    TOOLS.map(async (tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchemaHash: await hashSchema(tool.inputSchema),
      readOnlyHint: tool.readOnlyHint,
      untrustedContentHint: tool.untrustedContentHint,
    })),
  )
).sort((left, right) => (left.name < right.name ? -1 : 1));

const unsigned = {
  version: 1,
  origin: ORIGIN,
  path: PATH,
  // Fixed to the day, not the second: a manifest that changes every run produces a diff
  // on every deploy and teaches everyone to stop reading it.
  issuedAt: `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
  tools,
  algorithm: "Ed25519",
  publicKey: publicKeyBase64,
};

const signature = await crypto.subtle.sign(
  "Ed25519",
  privateKey,
  new TextEncoder().encode(canonicalize(unsigned)),
);

writeFileSync(OUTPUT, `${JSON.stringify({ ...unsigned, signature: toBase64(signature) }, null, 2)}\n`);

console.log(`Signed ${tools.length} tools for ${ORIGIN}${PATH}`);
console.log(`Wrote ${OUTPUT.replace(ROOT + "/", "")}`);
console.log(`Key fingerprint: ${publicKeyBase64.replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase()}`);
