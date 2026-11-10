import { defineConfig } from "vitest/config";
import path from "node:path";
// End-to-end security suite: runs against a live server at E2E_URL (CI starts `next start`).
export default defineConfig({
  test: { environment: "node", include: ["e2e/**/*.e2e.test.ts"], fileParallelism: false, testTimeout: 30_000 },
  css: { postcss: { plugins: [] } },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
