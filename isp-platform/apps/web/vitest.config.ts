import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    include: [
      "src/**/*.test.ts",
      "../../packages/payments/src/**/*.test.ts",
      "../../packages/billing/src/**/*.test.ts",
      "../../packages/network/src/**/*.test.ts",
      "../../packages/mikrotik/src/**/*.test.ts",
      "../../packages/radius/src/**/*.test.ts",
    ],
  },
});