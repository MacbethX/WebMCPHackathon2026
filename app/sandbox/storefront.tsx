"use client";

/**
 * The sandbox storefront. A small retro personal shop that exists to be tooled.
 *
 * Three tools live on this page:
 *   1. list_products    imperative, read-only  (tools.ts)
 *   2. add_to_guestbook imperative, mutating   (tools.ts)
 *   3. sign_guestbook   declarative, from the attributes on the form below
 *
 * The declarative tool and the imperative mutating tool deliberately do the same job by
 * different routes. Both funnel into `submitGuestbookEntry`, so both are revalidated
 * server-side and serialized against each other.
 *
 * Without WebMCP none of this is reachable and the shop behaves like an ordinary page.
 */

import { useCallback, useMemo, useState } from "react";
import { PRODUCTS } from "./catalog";
import { submitGuestbookEntry } from "./guestbook";
import { createAddToGuestbookTool, listProductsTool } from "./tools";
import { ToolRegistrations, useWebMCPSupported } from "@/lib/webmcp/registration-manager";
import { toolError, toolText } from "@/lib/webmcp/tool-result";
import type { GuestbookEntry } from "./guestbook";
import type { ValidatedEntry } from "../api/validate/route";
import styles from "./sandbox.module.css";

const SEED_ENTRIES: readonly GuestbookEntry[] = [
  {
    id: "seed_1",
    name: "Marguerite",
    message: "The lamp arrived warm. Ten stars.",
    signedAt: 0,
  },
];

let entryCounter = 0;
const nextEntryId = () => `entry_${(entryCounter += 1)}`;

export default function Storefront() {
  const supported = useWebMCPSupported();
  const [entries, setEntries] = useState<readonly GuestbookEntry[]>(SEED_ENTRIES);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  /** Stable, so the tool declaration does not churn between renders. */
  const append = useCallback((entry: ValidatedEntry) => {
    setEntries((current) => [
      ...current,
      { ...entry, id: nextEntryId(), signedAt: Date.now() },
    ]);
  }, []);

  const specs = useMemo(
    () => [listProductsTool, createAddToGuestbookTool(append)],
    [append],
  );

  const onGuestbookSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      const native = event.nativeEvent as SubmitEvent;
      const byAgent = native.agentInvoked === true;

      // preventDefault must come before respondWith, and this page never navigates on
      // submit in any case.
      event.preventDefault();

      const data = new FormData(form);
      const name = String(data.get("name") ?? "");
      const message = String(data.get("message") ?? "");

      const work = submitGuestbookEntry(name, message, append).then((outcome) => {
        switch (outcome.status) {
          case "accepted":
            setFormNotice(`Thanks, ${outcome.entry.name}. Your note is up.`);
            // Resetting the form cancels an in-flight declarative invocation, so it
            // only happens once the work is done and only for a human submission.
            if (!byAgent) form.reset();
            return toolText(`Signed the guestbook as ${outcome.entry.name}.`);
          case "rejected":
            setFormNotice(outcome.reason);
            return toolError(`The guestbook did not accept that entry. ${outcome.reason}`);
          case "ambiguous":
            setFormNotice("That may or may not have gone through. Check the list before signing again.");
            return toolError(
              "The outcome could not be confirmed. It is unsafe to retry: the entry may already be recorded.",
            );
        }
      });

      // Hands the result back to the agent with no navigation. Absent on browsers
      // without the declarative API, where this is an ordinary form.
      native.respondWith?.(work);
    },
    [append],
  );

  return (
    <div className={styles.shop}>
      <ToolRegistrations specs={specs} />

      <header className={styles.header}>
        <h1 className={styles.title}>Andrew&apos;s Curio Shelf</h1>
        <p className={styles.tagline}>Three things I own and will part with. Est. 1998.</p>
        <p className={supported ? styles.badgeOn : styles.badgeOff}>
          {supported ? "WebMCP detected: this page offers tools to agents" : "No WebMCP here: ordinary shop, everything works"}
        </p>
      </header>

      <section aria-labelledby="stock">
        <h2 id="stock" className={styles.heading}>For sale</h2>
        <ul className={styles.products}>
          {PRODUCTS.map((product) => (
            <li key={product.id} className={styles.product}>
              <span className={styles.emoji} aria-hidden="true">{product.emoji}</span>
              <div>
                <p className={styles.productName}>
                  {product.name} <span className={styles.price}>${product.priceUsd}</span>
                </p>
                <p className={styles.blurb}>{product.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="guestbook">
        <h2 id="guestbook" className={styles.heading}>Guestbook</h2>

        <ul className={styles.entries}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <span className={styles.entryName}>{entry.name}</span>
              <span className={styles.entryMessage}>{entry.message}</span>
            </li>
          ))}
        </ul>

        {/*
          The third tool. The browser synthesizes its schema from these attributes; no
          JavaScript registers it. No toolautosubmit: an agent fills this in and a human
          presses the button, until someone explicitly opts out of that.
        */}
        <form
          className={styles.form}
          onSubmit={onGuestbookSubmit}
          toolname="sign_guestbook"
          tooldescription="Signs the guestbook of Andrew's Curio Shelf with a short public message. Changes the page: the entry becomes visible to every visitor."
        >
          <label className={styles.label} htmlFor="guestbook-name">Your name</label>
          <input
            className={styles.input}
            id="guestbook-name"
            name="name"
            type="text"
            required
            maxLength={40}
            autoComplete="name"
            placeholder="Marguerite"
            toolparamdescription="Who is signing the guestbook. 1 to 40 characters."
          />

          <label className={styles.label} htmlFor="guestbook-message">Message</label>
          <textarea
            className={styles.textarea}
            id="guestbook-message"
            name="message"
            required
            maxLength={280}
            rows={3}
            placeholder="Say something nice about the duck."
            toolparamdescription="The public message to leave. 1 to 280 characters."
          />

          <button className={styles.submit} type="submit">Sign it</button>
          {formNotice ? <p className={styles.notice} role="status">{formNotice}</p> : null}
        </form>
      </section>
    </div>
  );
}
