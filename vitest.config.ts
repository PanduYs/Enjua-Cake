import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside the React Server Components runtime; tests run in plain Node.
  "server-only": fileURLToPath(new URL("./tests/support/empty-module.ts", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/support/integration-global-setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // Integration tests share one database; run files sequentially.
          fileParallelism: false,
        },
      },
    ],
  },
});
