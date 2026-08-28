"use client";

/**
 * The verification badge.
 *
 * It compares the tools actually registered on this page against the signed manifest the
 * author published, and it is careful about what it claims. "Verified" here means the
 * page matches its own published list and the list has not been altered by anyone
 * without the signing key. It does not mean the signer is who you think they are: the
 * public key travels inside the manifest, so anyone who can replace the file can replace
 * the key too.
 *
 * The fingerprint is shown for exactly that reason. Compared against a fingerprint you
 * already hold, it means something; on its own it is a consistency check. Saying so on
 * the badge is the difference between a security feature and a green tick that teaches
 * people to trust the wrong thing.
 */

import { useEffect, useRef, useState } from "react";
import { checkManifest, describeTool, keyFingerprint, sortTools } from "./manifest";
import { useRegisteredTools } from "./use-registered-tools";
import styles from "./trust-layer.module.css";
import type { ManifestVerdict, ToolManifest } from "./manifest";

export interface ManifestBadgeProps {
  /** Where the signed manifest lives, relative to this origin. */
  manifestUrl: string;
}

const TONE: Record<ManifestVerdict["state"], string> = {
  verified: styles.badgeVerified,
  mismatch: styles.badgeAlarm,
  "bad-signature": styles.badgeAlarm,
  "wrong-origin": styles.badgeAlarm,
  "no-manifest": styles.badgeUnknown,
};

const HEADLINE: Record<ManifestVerdict["state"], string> = {
  verified: "Tools match the signed manifest",
  mismatch: "Tools do not match the signed manifest",
  "bad-signature": "The manifest's signature does not check out",
  "wrong-origin": "This manifest was issued for somewhere else",
  "no-manifest": "No signed manifest for this page",
};

export function ToolManifestBadge({ manifestUrl }: ManifestBadgeProps) {
  const { tools, supported } = useRegisteredTools();
  const [verdict, setVerdict] = useState<ManifestVerdict | null>(null);

  /**
   * The manifest, fetched once and kept.
   *
   * Deliberately not re-fetched when the tool list changes. A badge that reloads the
   * published list every time the page registers something would let a page swap its own
   * manifest to match whatever it just did, which is the opposite of the point.
   */
  const cached = useRef<ToolManifest | null | undefined>(undefined);

  useEffect(() => {
    let current = true;

    const load: Promise<ToolManifest | null> =
      cached.current !== undefined
        ? Promise.resolve(cached.current)
        : fetch(manifestUrl, { cache: "no-store" })
            .then((response) => (response.ok ? (response.json() as Promise<ToolManifest>) : null))
            .catch(() => null)
            .then((loaded) => {
              cached.current = loaded;
              return loaded;
            });

    void load
      .then(async (manifest) => {
        const live = sortTools(await Promise.all(tools.map(describeTool)));
        return checkManifest(manifest, live, {
          origin: window.location.origin,
          path: window.location.pathname,
        });
      })
      .then((result) => {
        if (current) setVerdict(result);
      });

    return () => {
      current = false;
    };
  }, [manifestUrl, tools]);

  if (!supported || !verdict) return null;

  const fingerprint =
    "manifest" in verdict ? keyFingerprint(verdict.manifest.publicKey) : null;

  return (
    <section className={`${styles.manifest} ${TONE[verdict.state]}`} aria-live="polite">
      <p className={styles.manifestHeadline}>{HEADLINE[verdict.state]}</p>

      {verdict.state === "verified" ? (
        <p className={styles.manifestDetail}>
          All {tools.length} registered {tools.length === 1 ? "tool is" : "tools are"} in the
          manifest, with the same descriptions, schemas, and annotations that were signed.
        </p>
      ) : null}

      {verdict.state === "mismatch" ? (
        <ul className={styles.manifestList}>
          {verdict.differences.map((difference) => (
            <li key={`${difference.kind}_${difference.name}`}>
              <span className={styles.mono}>{difference.name}</span>: {difference.detail}
            </li>
          ))}
        </ul>
      ) : null}

      {verdict.state === "wrong-origin" ? (
        <p className={styles.manifestDetail}>
          It vouches for <span className={styles.mono}>{verdict.expected}</span>, which is not
          this page. A manifest copied from another site does not vouch for this one.
        </p>
      ) : null}

      {verdict.state === "bad-signature" ? (
        <p className={styles.manifestDetail}>
          The file has been altered since it was signed, or it was never signed by the key it
          carries. Treat the tools on this page as unpublished.
        </p>
      ) : null}

      {verdict.state === "no-manifest" ? (
        <p className={styles.manifestDetail}>
          Nothing here says which tools this page is supposed to offer, so there is nothing to
          check them against.
        </p>
      ) : null}

      {fingerprint ? (
        <p className={styles.manifestKey}>
          Signed by {fingerprint}. That proves the list has not been edited since signing. It
          does not prove who signed it: the key travels with the file. Compare the fingerprint
          against one you already trust.
        </p>
      ) : null}
    </section>
  );
}
