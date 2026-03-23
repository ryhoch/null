import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Resolve @null/core sub-paths directly from TypeScript source so the web
// build doesn't require a separate `pnpm --filter @null/core build` step.
const coreRoot = resolve(__dirname, "../core/src");
const coreAliases: Record<string, string> = {
  "@null/core/crypto":    resolve(coreRoot, "crypto/index.ts"),
  "@null/core/messaging": resolve(coreRoot, "messaging/index.ts"),
  "@null/core/p2p":       resolve(coreRoot, "p2p/index.ts"),
  "@null/core/wallet":    resolve(coreRoot, "wallet/index.ts"),
  "@null/core/storage":   resolve(coreRoot, "storage/index.ts"),
  "@null/core":           resolve(coreRoot, "index.ts"),
};

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "src"),
  resolve: {
    alias: {
      // Shared React app — same components as the Electron desktop build
      "@app": resolve(__dirname, "../desktop/src"),
      // Core library resolved from source (no dist/ needed)
      ...coreAliases,
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/index.html"),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
