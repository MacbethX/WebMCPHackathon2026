"use client";

/**
 * The in-page agent.
 *
 * It discovers tools through `document.modelContext.getTools()` and invokes them through
 * `executeTool()`, which is the spec's author-provided agent surface. It does not call
 * the tool functions directly, and it never could: it only holds the handles the browser
 * gave it, and the browser mediates every call.
 *
 * That matters beyond purity. Because the call goes through the platform, an approved
 * tool passes the consent gate and lands in the ledger whether this panel invokes it, an
 * extension does, or the browser's own agent does. The model here only decides; the page
 * acts.
 */

import { useCallback, useState } from "react";
import { invokeTool, resultText } from "@/lib/webmcp/agent-client";
import type { DiscoveredTool } from "@/lib/webmcp/agent-client";
import type { ActResponse, AgentResult } from "@/lib/agent/contract";
import styles from "./builder.module.css";

interface Turn {
  id: number;
  role: "you" | "agent" | "tool";
  text: string;
  error?: boolean;
}

let turnCounter = 0;
const nextTurnId = () => (turnCounter += 1);

export interface AgentPanelProps {
  tools: DiscoveredTool[];
  modelConfigured: boolean;
}

export function AgentPanel({ tools, modelConfigured }: AgentPanelProps) {
  const [request, setRequest] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const say = useCallback((role: Turn["role"], text: string, error = false) => {
    setTurns((current) => [...current, { id: nextTurnId(), role, text, error }]);
  }, []);

  const ask = useCallback(async () => {
    const question = request.trim();
    if (!question || busy) return;

    setRequest("");
    say("you", question);
    setBusy(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "act",
          request: question,
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            readOnly: tool.annotations?.readOnlyHint === true,
          })),
        }),
      });

      const payload = (await response.json()) as AgentResult<ActResponse>;

      if (!payload.ok) {
        say("agent", payload.reason, true);
        return;
      }

      const { toolName, argumentsJson, reasoning } = payload.data;
      say("agent", reasoning);

      if (!toolName) return;

      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) {
        say("agent", `The model picked "${toolName}", which this page does not offer.`, true);
        return;
      }

      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(argumentsJson || "{}");
        if (typeof parsed === "object" && parsed !== null) args = parsed as Record<string, unknown>;
      } catch {
        say("agent", "The model's arguments were not valid JSON, so nothing was called.", true);
        return;
      }

      // Through the browser, not around it. The consent gate and the ledger sit on the
      // far side of this call.
      const result = await invokeTool(tool, args);
      say("tool", resultText(result) || "(no output)", result.isError === true);
    } catch {
      say("agent", "The request could not be completed.", true);
    } finally {
      setBusy(false);
    }
  }, [busy, request, say, tools]);

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>In-page agent</h2>

      <ul className={styles.toolList}>
        {tools.length === 0 ? (
          <li className={styles.toolRow}>
            <span className={styles.note}>
              No tools registered yet. Approve one and it appears here, via the
              document&apos;s <code>toolchange</code> event.
            </span>
          </li>
        ) : (
          tools.map((tool) => (
            <li className={styles.toolRow} key={tool.name}>
              <span className={styles.mono}>{tool.name}</span>
              {tool.annotations?.readOnlyHint ? (
                <span className={styles.routeTag}> read only</span>
              ) : null}
              <br />
              <span className={styles.note}>{tool.description}</span>
            </li>
          ))
        )}
      </ul>

      <div className={styles.ask}>
        <input
          className={styles.input}
          value={request}
          placeholder={
            modelConfigured ? "Ask for something in plain words" : "Needs a model key on the server"
          }
          disabled={!modelConfigured || busy}
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask();
          }}
        />
        <button
          className={styles.primary}
          type="button"
          disabled={!modelConfigured || busy || request.trim().length === 0}
          onClick={() => void ask()}
        >
          {busy ? "Thinking" : "Send"}
        </button>
      </div>

      {!modelConfigured ? (
        <p className={styles.note}>
          The agent needs a model key. Everything else on this page works without one:
          paste, propose, edit, approve, and register.
        </p>
      ) : null}

      {turns.length > 0 ? (
        <ul className={styles.transcript}>
          {turns.map((turn) => (
            <li className={styles.turn} key={turn.id}>
              <span className={styles.turnRole}>{turn.role}</span>
              <p className={turn.error ? `${styles.turnBody} ${styles.turnError}` : styles.turnBody}>
                {turn.text}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
