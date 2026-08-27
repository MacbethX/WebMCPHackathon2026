import type { NextConfig } from "next";

/**
 * Response headers (CLAUDE.md rule 2 and rule 3).
 *
 * WebMCP only works in origin-isolated documents. `Origin-Agent-Cluster: ?0` disables
 * it outright. Rather than rely on the platform default staying favourable, this
 * asserts `?1` explicitly, so origin isolation is a property of the deployment that can
 * be checked with curl instead of inferred.
 *
 * Asserting `?1` also forbids `document.domain`, which this repo never uses.
 *
 * `Permissions-Policy: tools` is deliberately NOT set. The `tools` feature already
 * defaults to `self`, which is what a single-origin app wants; writing the header adds
 * a way to get it wrong and nothing else. If a cross-origin iframe ever needs tools it
 * gets an explicit `allow="tools"` and a written reason, per rule 3.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Origin-Agent-Cluster", value: "?1" }],
      },
    ];
  },
};

export default nextConfig;
