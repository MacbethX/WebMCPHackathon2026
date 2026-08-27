"use client";

/**
 * The human-readable half of rule 10. The ledger itself is data; this renders it and
 * hands it over as JSON.
 *
 * The export carries the session public key alongside the receipts, so whoever receives
 * it can verify the signatures without asking the page for anything. A ledger you cannot
 * check independently is a log with extra steps.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  exportLedger,
  fingerprint,
  getLedger,
  getServerLedger,
  getSessionPublicKey,
  subscribeLedger,
} from "./receipt-ledger";
import styles from "./trust-layer.module.css";
import type { ConsentStatus, Receipt } from "./receipt-ledger";

const CONSENT_LABEL: Record<ConsentStatus, string> = {
  "not-required": "read only",
  approved: "approved",
  denied: "denied",
  canceled: "withdrawn",
  "human-submitted": "signed by hand",
};

const CONSENT_CLASS: Record<ConsentStatus, string> = {
  "not-required": styles.consentNotRequired,
  approved: styles.consentApproved,
  denied: styles.consentDenied,
  canceled: styles.consentCanceled,
  "human-submitted": styles.consentHumanSubmitted,
};

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleTimeString();
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const args = Object.entries(receipt.args);

  return (
    <li className={styles.receipt}>
      <span className={styles.seq}>#{receipt.seq}</span>

      <p className={styles.receiptLine}>
        <span className={styles.toolName}>{receipt.tool}</span>{" "}
        <span className={`${styles.consent} ${CONSENT_CLASS[receipt.consent]}`}>
          {CONSENT_LABEL[receipt.consent]}
        </span>
      </p>

      <p className={styles.receiptSummary}>
        {receipt.resultSummary}
        {args.length > 0 ? (
          <>
            {" "}
            <span className={styles.receiptMeta}>
              ({args.map(([key, value]) => `${key}: ${String(value)}`).join(", ")})
            </span>
          </>
        ) : null}
      </p>

      <p className={styles.receiptMeta}>
        {formatTime(receipt.timestamp)}
        {receipt.signature ? (
          <> signed {receipt.signature.slice(0, 12)}...</>
        ) : (
          <span className={styles.unsigned}> unsigned: {receipt.signatureNote}</span>
        )}
      </p>
    </li>
  );
}

export function ReceiptLedgerPanel() {
  const receipts = useSyncExternalStore(subscribeLedger, getLedger, getServerLedger);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // The session key is generated lazily on the first receipt, so this re-reads whenever
  // the ledger changes rather than once on mount.
  useEffect(() => {
    let current = true;
    void getSessionPublicKey().then((key) => {
      if (current) setPublicKey(key);
    });
    return () => {
      current = false;
    };
  }, [receipts]);

  const download = async () => {
    const payload = await exportLedger();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `toolsmith-receipts-${payload.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.ledger}>
      <div className={styles.ledgerHead}>
        <p className={styles.ledgerKey}>
          {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
          {publicKey ? <> signed by session key {fingerprint(publicKey)}</> : null}
        </p>
        <button
          className={styles.export}
          type="button"
          onClick={download}
          disabled={receipts.length === 0}
        >
          Export JSON
        </button>
      </div>

      {receipts.length === 0 ? (
        <p className={styles.empty}>
          No tool calls yet. Every call an agent makes lands here, approved or refused.
        </p>
      ) : (
        <ul className={styles.receipts}>
          {receipts.map((receipt) => (
            <ReceiptRow key={receipt.seq} receipt={receipt} />
          ))}
        </ul>
      )}
    </div>
  );
}
