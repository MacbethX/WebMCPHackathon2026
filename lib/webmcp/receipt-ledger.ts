/**
 * Receipt ledger (CLAUDE.md rule 10).
 *
 * Every tool call appends a receipt, whether it was gated or not, approved or refused.
 * Each receipt is signed Ed25519 with a keypair generated for this session and never
 * persisted, so a ledger can be checked for tampering by anyone holding the session's
 * public key, and cannot be forged after the tab closes.
 *
 * What signing does and does not buy: it proves the ledger was not edited after the
 * fact by something that does not hold the private key. It does not prove the page told
 * the truth when it wrote the entry. That distinction is the honest posture the Chrome
 * secure-tools guidance asks for, and the README says it in those words.
 */

import type { ConsentDecision } from "./consent-gate";

/** How consent was obtained, or why it was not needed. */
export type ConsentStatus =
  | "not-required"
  | ConsentDecision
  | "human-submitted";

export interface Receipt {
  /** Position in the ledger, from 1. Part of the signed payload, so gaps are visible. */
  seq: number;
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
  consent: ConsentStatus;
  /** Base64 Ed25519 signature over the canonical payload, or null if unsigned. */
  signature: string | null;
  /** Why a receipt is unsigned, when it is. */
  signatureNote?: string;
}

export interface LedgerExport {
  algorithm: "Ed25519";
  /** Base64 raw public key for this session. Null when signing was unavailable. */
  publicKey: string | null;
  exportedAt: string;
  receipts: readonly Receipt[];
}

/** Values longer than this are truncated in a receipt. Receipts are a log, not storage. */
const MAX_FIELD_CHARS = 200;

/** Argument names that never reach a receipt, whatever they contain. */
const SECRET_KEY_PATTERN = /key|token|secret|password|credential|authorization|cookie/i;

/**
 * One frozen empty array, shared. `getServerLedger` feeds `useSyncExternalStore`'s
 * server snapshot, which must be referentially stable: a fresh `[]` per call reads as a
 * changed store on every render and React spins.
 */
const NO_RECEIPTS: readonly Receipt[] = Object.freeze([]);

let ledger: readonly Receipt[] = NO_RECEIPTS;
const listeners = new Set<() => void>();

function publish(next: readonly Receipt[]): void {
  ledger = next;
  for (const listener of listeners) listener();
}

export function subscribeLedger(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getLedger = (): readonly Receipt[] => ledger;
export const getServerLedger = () => NO_RECEIPTS;

/** Test seam. Drops the ledger and the session key. */
export function resetLedger(): void {
  sessionKeys = null;
  keyPromise = null;
  publish(NO_RECEIPTS);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

interface SessionKeys {
  privateKey: CryptoKey;
  publicKeyBase64: string;
}

let sessionKeys: SessionKeys | null = null;
let keyPromise: Promise<SessionKeys | null> | null = null;

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * Generates the session keypair once, lazily. Resolves null where Ed25519 is not
 * available, in which case receipts are written unsigned and say so rather than
 * quietly switching to a different algorithm.
 */
function getSessionKeys(): Promise<SessionKeys | null> {
  if (sessionKeys) return Promise.resolve(sessionKeys);
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    try {
      const pair = (await subtle.generateKey("Ed25519", true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const raw = await subtle.exportKey("raw", pair.publicKey);
      sessionKeys = { privateKey: pair.privateKey, publicKeyBase64: toBase64(raw) };
      return sessionKeys;
    } catch {
      return null;
    }
  })();

  return keyPromise;
}

/** Base64 raw public key for this session, or null if signing is unavailable. */
export async function getSessionPublicKey(): Promise<string | null> {
  return (await getSessionKeys())?.publicKeyBase64 ?? null;
}

/** A short, human-comparable form of the public key. */
export function fingerprint(publicKeyBase64: string): string {
  return publicKeyBase64.replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase();
}

/**
 * Deterministic JSON with sorted keys. Two runs over equal data produce byte-identical
 * output, which is the whole basis of a checkable signature.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
  return `{${entries.join(",")}}`;
}

/** The bytes a signature covers: everything in the receipt except the signature itself. */
export function signedPayload(receipt: Receipt): string {
  return canonicalize({
    seq: receipt.seq,
    timestamp: receipt.timestamp,
    tool: receipt.tool,
    args: receipt.args,
    resultSummary: receipt.resultSummary,
    consent: receipt.consent,
  });
}

// ---------------------------------------------------------------------------
// Appending
// ---------------------------------------------------------------------------

function truncate(value: string): string {
  return value.length <= MAX_FIELD_CHARS
    ? value
    : `${value.slice(0, MAX_FIELD_CHARS - 3)}...`;
}

/**
 * Copies arguments into a receipt, dropping anything whose name suggests a secret and
 * shortening the rest. Nothing here is a trust boundary; it is a log hygiene pass.
 */
export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value === undefined) continue;
    out[key] = typeof value === "string" ? truncate(value) : value;
  }
  return out;
}

export interface ReceiptInput {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
  consent: ConsentStatus;
  /** Injected in tests. Defaults to now. */
  timestamp?: string;
}

/** Appends one signed receipt and returns it. */
export async function appendReceipt(input: ReceiptInput): Promise<Receipt> {
  const draft: Receipt = {
    seq: ledger.length + 1,
    timestamp: input.timestamp ?? new Date().toISOString(),
    tool: input.tool,
    args: redactArgs(input.args),
    resultSummary: truncate(input.resultSummary),
    consent: input.consent,
    signature: null,
  };

  const keys = await getSessionKeys();
  if (!keys) {
    draft.signatureNote = "Ed25519 signing is unavailable in this browser.";
  } else {
    try {
      const bytes = new TextEncoder().encode(signedPayload(draft));
      const signature = await globalThis.crypto.subtle.sign("Ed25519", keys.privateKey, bytes);
      draft.signature = toBase64(signature);
    } catch {
      draft.signatureNote = "Signing failed for this entry.";
    }
  }

  publish([...ledger, draft]);
  return draft;
}

/** Verifies one receipt against a session public key. Used by tests and by export checks. */
export async function verifyReceipt(
  receipt: Receipt,
  publicKeyBase64: string,
): Promise<boolean> {
  if (!receipt.signature) return false;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;

  try {
    const key = await subtle.importKey(
      "raw",
      fromBase64(publicKeyBase64) as unknown as BufferSource,
      "Ed25519",
      false,
      ["verify"],
    );
    return await subtle.verify(
      "Ed25519",
      key,
      fromBase64(receipt.signature) as unknown as BufferSource,
      new TextEncoder().encode(signedPayload(receipt)) as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

/** The ledger as a portable document, public key included so it can be checked. */
export async function exportLedger(): Promise<LedgerExport> {
  return {
    algorithm: "Ed25519",
    publicKey: await getSessionPublicKey(),
    exportedAt: new Date().toISOString(),
    receipts: getLedger(),
  };
}
