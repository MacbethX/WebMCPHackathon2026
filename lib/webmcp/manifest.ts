/**
 * Signed tool manifest (CLAUDE.md M6).
 *
 * A page can register any tool at any time, and a visitor has no way to tell an author's
 * tool from one an extension, an injected script, or a compromised bundle put there. The
 * manifest is the author's statement of what the page is supposed to offer, signed, so
 * the live tool list can be checked against it.
 *
 * What a verified badge means, precisely:
 *
 *   - The manifest has not been altered since it was signed, by anyone without the key.
 *   - The tools registered on this page match the ones the manifest lists, including
 *     their descriptions, annotations, and schemas.
 *
 * What it does NOT mean, and the badge says so:
 *
 *   - Anything about who signed it. The public key travels inside the manifest, so
 *     whoever can replace the manifest can replace the key with their own and re-sign.
 *     Establishing identity needs the key from somewhere else: a fingerprint you already
 *     know, or a channel that is not the file being checked.
 *
 * That is a real limit, not a caveat to bury. What the manifest genuinely catches is a
 * tool appearing, disappearing, or changing its description out from under a page whose
 * author published a list. That is the attack worth catching, because a tool's
 * description is what an agent acts on.
 */

import { canonicalize } from "./receipt-ledger";
import type { DiscoveredTool } from "./agent-client";

/** One tool as the manifest records it. Schemas are hashed, not copied. */
export interface ManifestTool {
  name: string;
  description: string;
  /** SHA-256 of the canonical schema, hex. Null when the tool declares none. */
  inputSchemaHash: string | null;
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
}

export interface ToolManifest {
  version: 1;
  /** The origin these tools belong to. A manifest lifted to another host fails here. */
  origin: string;
  /** Path the tools appear on, so one origin can publish several. */
  path: string;
  issuedAt: string;
  tools: ManifestTool[];
  algorithm: "Ed25519";
  /** Base64 raw public key. See the note above about what this can and cannot prove. */
  publicKey: string;
  /** Base64 signature over the canonical payload. */
  signature: string;
}

/** The manifest without its signature: exactly the bytes that get signed. */
export type ManifestPayload = Omit<ToolManifest, "signature">;

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 of a schema, over its canonical form.
 *
 * Hashed rather than embedded so the manifest stays small and so key order in the
 * original schema cannot change the result.
 */
export async function hashSchema(schema: unknown): Promise<string | null> {
  if (schema === null || schema === undefined) return null;

  const bytes = new TextEncoder().encode(canonicalize(schema));
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return toHex(digest);
}

/** The bytes a manifest signature covers. */
export function manifestPayload(manifest: ManifestPayload): string {
  return canonicalize({
    version: manifest.version,
    origin: manifest.origin,
    path: manifest.path,
    issuedAt: manifest.issuedAt,
    tools: manifest.tools,
    algorithm: manifest.algorithm,
    publicKey: manifest.publicKey,
  });
}

/** Records a live tool the way the manifest will. */
export async function describeTool(tool: DiscoveredTool): Promise<ManifestTool> {
  return {
    name: tool.name,
    description: tool.description,
    inputSchemaHash: await hashSchema(tool.inputSchema),
    readOnlyHint: tool.annotations?.readOnlyHint === true,
    untrustedContentHint: tool.annotations?.untrustedContentHint === true,
  };
}

/** Sorted by name, so the manifest does not depend on registration order. */
export function sortTools(tools: readonly ManifestTool[]): ManifestTool[] {
  return [...tools].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

export async function verifyManifest(manifest: ToolManifest): Promise<boolean> {
  if (manifest.version !== 1 || manifest.algorithm !== "Ed25519") return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      fromBase64(manifest.publicKey) as unknown as BufferSource,
      "Ed25519",
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      "Ed25519",
      key,
      fromBase64(manifest.signature) as unknown as BufferSource,
      new TextEncoder().encode(manifestPayload(manifest)) as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

/** How a manifest and the page disagree, if they do. */
export interface ManifestDifference {
  kind: "unlisted" | "missing" | "changed";
  name: string;
  detail: string;
}

/**
 * Compares the live tool list against the manifest.
 *
 * `unlisted` is the one that matters most: a tool on the page that the author never
 * published. `missing` usually means a tool that unregistered with the UI it belongs to,
 * so it is reported but is often innocent.
 */
export function compareToManifest(
  manifest: readonly ManifestTool[],
  live: readonly ManifestTool[],
): ManifestDifference[] {
  const differences: ManifestDifference[] = [];
  const listed = new Map(manifest.map((tool) => [tool.name, tool]));
  const present = new Map(live.map((tool) => [tool.name, tool]));

  for (const tool of live) {
    const expected = listed.get(tool.name);
    if (!expected) {
      differences.push({
        kind: "unlisted",
        name: tool.name,
        detail: "This tool is registered on the page but is not in the signed manifest.",
      });
      continue;
    }

    if (expected.description !== tool.description) {
      differences.push({
        kind: "changed",
        name: tool.name,
        detail: "The description an agent reads differs from the one that was signed.",
      });
    }
    if (expected.inputSchemaHash !== tool.inputSchemaHash) {
      differences.push({
        kind: "changed",
        name: tool.name,
        detail: "The input schema differs from the one that was signed.",
      });
    }
    if (
      expected.readOnlyHint !== tool.readOnlyHint ||
      expected.untrustedContentHint !== tool.untrustedContentHint
    ) {
      differences.push({
        kind: "changed",
        name: tool.name,
        detail: "The annotations differ from the ones that were signed, so the tool's safety story changed.",
      });
    }
  }

  for (const tool of manifest) {
    if (!present.has(tool.name)) {
      differences.push({
        kind: "missing",
        name: tool.name,
        detail: "The manifest lists this tool, but it is not registered right now.",
      });
    }
  }

  return differences;
}

export type ManifestVerdict =
  | { state: "verified"; manifest: ToolManifest }
  | { state: "no-manifest" }
  | { state: "bad-signature"; manifest: ToolManifest }
  | { state: "wrong-origin"; manifest: ToolManifest; expected: string }
  | { state: "mismatch"; manifest: ToolManifest; differences: ManifestDifference[] };

/** The whole check: signature, origin, then contents. */
export async function checkManifest(
  manifest: ToolManifest | null,
  live: readonly ManifestTool[],
  location: { origin: string; path: string },
): Promise<ManifestVerdict> {
  if (!manifest) return { state: "no-manifest" };

  if (!(await verifyManifest(manifest))) return { state: "bad-signature", manifest };

  // A manifest is bound to where it was issued. Without this, a valid manifest could be
  // copied to another site to vouch for a different page's tools.
  if (manifest.origin !== location.origin || manifest.path !== location.path) {
    return { state: "wrong-origin", manifest, expected: `${manifest.origin}${manifest.path}` };
  }

  const differences = compareToManifest(manifest.tools, live);
  return differences.length === 0
    ? { state: "verified", manifest }
    : { state: "mismatch", manifest, differences };
}

/** A short, human-comparable form of the signing key, for checking out of band. */
export function keyFingerprint(publicKeyBase64: string): string {
  return (publicKeyBase64.match(/[A-Za-z0-9]/g) ?? []).join("").slice(0, 16).toUpperCase();
}

/** Signs a manifest. Used by the signing script, and by the tests. */
export async function signManifest(
  payload: Omit<ManifestPayload, "algorithm" | "publicKey">,
  privateKey: CryptoKey,
  publicKeyBase64: string,
): Promise<ToolManifest> {
  const unsigned: ManifestPayload = {
    ...payload,
    tools: sortTools(payload.tools),
    algorithm: "Ed25519",
    publicKey: publicKeyBase64,
  };

  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(manifestPayload(unsigned)) as unknown as BufferSource,
  );

  return { ...unsigned, signature: toBase64(signature) };
}

export const manifestBase64 = { toBase64, fromBase64 };
