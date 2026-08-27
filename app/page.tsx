import Link from "next/link";
import styles from "./page.module.css";

/**
 * Placeholder for the builder UI. The real thing (paste HTML, review proposals,
 * approve, register live) lands in M4. Until then this says what the project is and
 * points at the one thing that works.
 */
export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Toolsmith</h1>
      <p className={styles.lede}>
        Where a human and an AI agent make a website agent-ready, together. Paste a
        page&apos;s HTML, get proposed WebMCP tools, edit and approve each one, and take
        away real code. Every state-changing call passes a consent gate and lands in a
        signed receipt ledger.
      </p>
      <p className={styles.status}>
        The builder is not here yet. The sandbox it works against is.
      </p>
      <Link className={styles.link} href="/sandbox">
        Open the sandbox shop
      </Link>
    </main>
  );
}
