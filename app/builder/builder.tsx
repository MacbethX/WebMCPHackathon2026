"use client";

/**
 * The builder loop: paste, propose, review, approve, and the tool is live.
 *
 * The pasted markup is sanitized and rendered, so an approved tool has a real form to
 * act on. Which route a proposal takes decides who registers it:
 *
 *   declarative  we write toolname/tooldescription/toolparamdescription onto the preview
 *                form and the browser synthesizes the tool from them
 *   imperative   we register a ToolSpec through the registration manager, wrapped in the
 *                consent gate and the ledger
 *
 * Either way the new tool reaches the in-page agent through `toolchange`, not through
 * anything this component tells it. That is the point of using the platform's own list:
 * the agent sees what the browser sees.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildBundle, bundleFileName } from "@/lib/generator/bundle";
import { checkInput, generate, regenerate } from "@/lib/generator/generate";
import { annotateForm } from "@/lib/generator/declarative-emitter";
import { buildLiveTool } from "@/lib/generator/live-tool";
import { sanitizeHtml } from "@/lib/generator/sanitize";
import { ConsentGate } from "@/lib/webmcp/consent-gate";
import { ReceiptLedgerPanel } from "@/lib/webmcp/receipt-ledger-panel";
import { ToolRegistrations, useWebMCPSupported } from "@/lib/webmcp/registration-manager";
import { useRegisteredTools } from "@/lib/webmcp/use-registered-tools";
import { withTrust } from "@/lib/webmcp/trust";
import { AgentPanel } from "./agent-panel";
import { ProposalCard } from "./proposal-card";
import { SAMPLE_HTML } from "./sample";
import type { GeneratedTool } from "@/lib/generator/generate";
import type { RefineResponse, AgentResult } from "@/lib/agent/contract";
import type { ToolProposal } from "@/lib/generator/proposal";
import styles from "./builder.module.css";

interface ModelStatus {
  model: string;
  configured: boolean;
}

export default function Builder() {
  const webmcpSupported = useWebMCPSupported();
  const { tools } = useRegisteredTools();

  const [pasted, setPasted] = useState("");
  const [sanitized, setSanitized] = useState<{ html: string; removed: string[] } | null>(null);
  const [generated, setGenerated] = useState<GeneratedTool[]>([]);
  /** Each form's own markup, kept so an edited proposal can be re-emitted. */
  const [formSources, setFormSources] = useState<string[]>([]);
  const [approved, setApproved] = useState<Record<string, ToolProposal>>({});
  const [refining, setRefining] = useState<string | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/agent")
      .then((response) => (response.ok ? (response.json() as Promise<ModelStatus>) : null))
      .then(setModel)
      .catch(() => setModel(null));
  }, []);

  /** Sanitize, analyze, and emit. Nothing is registered until a person approves. */
  const propose = useCallback(() => {
    setNotice(null);
    setApproved({});

    const source = pasted.trim();
    const refusal = checkInput(source);
    if (refusal) {
      setSanitized(null);
      setGenerated([]);
      setFormSources([]);
      setNotice(refusal);
      return;
    }

    const clean = sanitizeHtml(source);
    setSanitized(clean);

    const results = generate(clean.html);
    setGenerated(results);

    // Each form on its own, so editing a proposal can re-run the emitters against the
    // markup that produced it rather than against the whole page.
    const parsed = new DOMParser().parseFromString(clean.html, "text/html");
    setFormSources(Array.from(parsed.querySelectorAll("form")).map((form) => form.outerHTML));

    if (results.length === 0) {
      setNotice("No forms in that markup. The generator only proposes tools for forms so far.");
    }
  }, [pasted]);

  const updateProposal = useCallback(
    (index: number, proposal: ToolProposal) => {
      setGenerated((current) => {
        const next = [...current];
        // Re-emit on every edit, so the code shown under a proposal always matches the
        // fields above it. Cheap, and it keeps the linter's verdict current too.
        next[index] = regenerate(proposal, formSources[index] ?? "");
        return next;
      });
    },
    [formSources],
  );

  /** The declarative route writes attributes straight onto the rendered preview form. */
  const findForm = useCallback((formId: string | null, index: number) => {
    return () => {
      const root = previewRef.current;
      if (!root) return null;
      const forms = root.querySelectorAll("form");
      if (formId) {
        const byId = root.querySelector<HTMLFormElement>(`form[id="${CSS.escape(formId)}"]`);
        if (byId) return byId;
      }
      return (forms[index] as HTMLFormElement | undefined) ?? null;
    };
  }, []);

  const approve = useCallback(
    (index: number) => {
      const proposal = generated[index].proposal;

      if (proposal.route === "declarative") {
        const form = findForm(proposal.source.id, index)();
        if (!form) {
          setNotice("The preview form is not on the page, so the attributes could not be written.");
          return;
        }
        // The browser reads these and registers the tool itself. Nothing else to do.
        annotateForm(form, proposal);
      }

      setApproved((current) => ({ ...current, [proposal.name]: proposal }));
      setNotice(
        proposal.route === "declarative"
          ? `Wrote the tool attributes onto the preview form. The browser registers ${proposal.name} from the markup.`
          : `Registered ${proposal.name}. It is gated and recorded like every other tool here.`,
      );
    },
    [findForm, generated],
  );

  const revoke = useCallback(
    (index: number) => {
      const proposal = generated[index].proposal;

      if (proposal.route === "declarative") {
        const form = findForm(proposal.source.id, index)();
        // Removing toolname is what unregisters a declarative tool.
        form?.removeAttribute("toolname");
        form?.removeAttribute("tooldescription");
        form?.removeAttribute("toolautosubmit");
      }

      setApproved((current) => {
        const next = { ...current };
        delete next[proposal.name];
        return next;
      });
      setNotice(`Unregistered ${proposal.name}.`);
    },
    [findForm, generated],
  );

  const refine = useCallback(
    async (index: number) => {
      const proposal = generated[index].proposal;
      setRefining(proposal.name);
      setNotice(null);

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "refine",
            toolName: proposal.name,
            draftDescription: proposal.description,
            mutating: proposal.annotations.readOnlyHint !== true,
            context: sanitized?.html.slice(0, 8000),
            params: proposal.params.map((param) => ({
              name: param.name,
              draftDescription: param.description,
              type: param.control.type,
              required: param.required,
              constraints: [
                param.control.minLength !== undefined ? `min length ${param.control.minLength}` : null,
                param.control.maxLength !== undefined ? `max length ${param.control.maxLength}` : null,
                param.control.pattern ? `pattern ${param.control.pattern}` : null,
              ]
                .filter(Boolean)
                .join(", ") || undefined,
            })),
          }),
        });

        const payload = (await response.json()) as AgentResult<RefineResponse>;
        if (!payload.ok) {
          setNotice(payload.reason);
          return;
        }

        // The model rewrites prose only. Parameter names come from the markup, so a
        // description for a name we do not have is dropped rather than trusted.
        const byName = new Map(payload.data.params.map((param) => [param.name, param.description]));
        updateProposal(index, {
          ...proposal,
          description: payload.data.description,
          params: proposal.params.map((param) => ({
            ...param,
            description: byName.get(param.name) ?? param.description,
          })),
        });
      } catch {
        setNotice("The model could not be reached.");
      } finally {
        setRefining(null);
      }
    },
    [generated, sanitized, updateProposal],
  );

  /**
   * The approved tools, as a zip.
   *
   * Only approved ones: the bundle is a record of what a person signed off, not of what
   * the generator happened to produce.
   */
  const exportBundle = useCallback(() => {
    const approvedNames = new Set(Object.keys(approved));
    const tools = generated.filter((entry) => approvedNames.has(entry.proposal.name));
    if (tools.length === 0) return;

    const generatedAt = new Date();
    const bytes = buildBundle({ tools, generatedAt });
    // Copied into a fresh buffer: Blob wants an ArrayBuffer, and the typed array's own
    // buffer may be a view into a larger one.
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/zip" });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = bundleFileName(generatedAt);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [approved, generated]);

  /** Approved imperative tools, wrapped in the trust layer and registered for real. */
  const liveSpecs = useMemo(
    () =>
      Object.values(approved)
        .filter((proposal) => proposal.route === "imperative")
        .map((proposal) => {
          const index = generated.findIndex((entry) => entry.proposal.name === proposal.name);
          return withTrust(buildLiveTool(proposal, findForm(proposal.source.id, Math.max(index, 0))));
        }),
    [approved, findForm, generated],
  );

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <ToolRegistrations specs={liveSpecs} />

        <header className={styles.header}>
          <h1 className={styles.title}>Toolsmith</h1>
          <p className={styles.tagline}>
            Paste a page. Get tools an agent can use. Approve every one of them.
          </p>
          <div className={styles.statusRow}>
            <p className={webmcpSupported ? styles.badge : styles.badgeWarn}>
              {webmcpSupported
                ? "WebMCP detected"
                : "No WebMCP: you can still generate code, but nothing will register"}
            </p>
            <p className={model?.configured ? styles.badge : styles.badgeOff}>
              {model?.configured
                ? `model: ${model.model}`
                : "no model key: the agent and the wording helper are off"}
            </p>
            <a className={styles.badgeOff} href="/sandbox">
              sandbox shop
            </a>
          </div>
        </header>

        <div className={styles.columns}>
          <div>
            <section className={styles.panel}>
              <h2 className={styles.heading}>1. Paste a page</h2>
              <textarea
                className={styles.paste}
                value={pasted}
                placeholder="Paste HTML containing a form"
                onChange={(event) => setPasted(event.target.value)}
              />
              <div className={styles.actions}>
                <button className={styles.primary} type="button" onClick={propose}>
                  Propose tools
                </button>
                <button
                  className={styles.secondary}
                  type="button"
                  onClick={() => setPasted(SAMPLE_HTML)}
                >
                  Use the sample form
                </button>
              </div>
              {notice ? <p className={styles.note}>{notice}</p> : null}
              {sanitized && sanitized.removed.length > 0 ? (
                <p className={styles.error}>
                  Removed before rendering: {sanitized.removed.join(", ")}
                </p>
              ) : null}
            </section>

            {generated.length > 0 ? (
              <section>
                <h2 className={styles.heading}>2. Review and approve</h2>
                {Object.keys(approved).length > 0 ? (
                  <div className={styles.actions}>
                    <button className={styles.secondary} type="button" onClick={exportBundle}>
                      Download {Object.keys(approved).length} approved tool
                      {Object.keys(approved).length === 1 ? "" : "s"} as a zip
                    </button>
                  </div>
                ) : null}
                {generated.map((entry, index) => (
                  <ProposalCard
                    key={entry.proposal.source.id ?? index}
                    generated={entry}
                    approved={approved[entry.proposal.name] !== undefined}
                    busy={refining === entry.proposal.name}
                    refineAvailable={model?.configured === true}
                    onChange={(proposal) => updateProposal(index, proposal)}
                    onApprove={() => approve(index)}
                    onRevoke={() => revoke(index)}
                    onRefine={() => void refine(index)}
                  />
                ))}
              </section>
            ) : null}
          </div>

          <div>
            <section className={styles.panel}>
              <h2 className={styles.heading}>The page, as an agent will act on it</h2>
              <div
                className={styles.preview}
                ref={previewRef}
                // Sanitized above: scripts, event handlers, styles, and navigation
                // targets are gone before this ever reaches the DOM.
                dangerouslySetInnerHTML={{ __html: sanitized?.html ?? "<p>Nothing pasted yet.</p>" }}
              />
            </section>

            <AgentPanel tools={tools} modelConfigured={model?.configured === true} />

            <section className={styles.panel}>
              <h2 className={styles.heading}>Receipts</h2>
              <ReceiptLedgerPanel />
            </section>
          </div>
        </div>
      </div>

      <ConsentGate />
    </div>
  );
}
