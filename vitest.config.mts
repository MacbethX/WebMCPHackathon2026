import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * No @vitejs/plugin-react here. Vitest transforms TSX with esbuild using the
 * `jsx: "react-jsx"` setting from tsconfig; Fast Refresh is a dev-server concern that
 * tests have no use for, and the plugin drags in a second copy of vite.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
