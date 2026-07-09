import path from "path";
import { defineConfig } from "vitest/config";

// Standalone unit-test harness for the marketing workspace. Unlike `front`'s
// config there is no globalSetup/DB — marketing tests are pure logic (cookie
// scoping, experiment variant narrowing), so they run without external infra.
export default defineConfig({
  test: {
    globals: true,
    // jsdom provides `document`/`window` for the cookie readers.
    environment: "jsdom",
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@marketing": path.resolve(__dirname, "./"),
    },
  },
});
