"use client";

/**
 * The page's own tool list, kept current by `toolchange`.
 *
 * The event is the reason this is not a poll. When a tool is registered or aborted the
 * document fires `toolchange`, so the list an agent sees and the list a person sees come
 * from the same signal and cannot drift.
 */

import { useCallback, useEffect, useState } from "react";
import { discoverTools, subscribeToTools } from "./agent-client";
import { useWebMCPSupported } from "./registration-manager";
import type { DiscoveredTool } from "./agent-client";

export interface RegisteredToolsState {
  tools: DiscoveredTool[];
  supported: boolean;
  /** True until the first read completes. */
  loading: boolean;
  /** Re-reads immediately, for cases where a change is expected but not signalled. */
  refresh: () => void;
}

export function useRegisteredTools(): RegisteredToolsState {
  const [tools, setTools] = useState<DiscoveredTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // Feature detection is read through useSyncExternalStore, not written from an effect.
  const supported = useWebMCPSupported();

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let current = true;

    void discoverTools().then((discovered) => {
      if (!current) return;
      setTools(discovered);
      setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [nonce]);

  useEffect(() => subscribeToTools(refresh), [refresh]);

  return { tools, supported, loading, refresh };
}
