import react from "@vitejs/plugin-react";
import path from "path";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";

// Virtual module plugin to stub out server-side only modules
function stubModulesPlugin(): Plugin {
  const stubs: Record<string, string> = {
    // Stream: minimal stub for Node.js stream module
    stream:
      "export class Readable { pipe() { return this; } on() { return this; } once() { return this; } destroy() {} } export class Writable { write() { return true; } end() {} on() { return this; } once() { return this; } } export class Transform extends Readable {} export class Duplex extends Readable { write() { return true; } end() {} } export default { Readable, Writable, Transform, Duplex };",
  };

  // Stubs for resolved file paths (after @app alias is applied)
  const filePathStubs: Record<string, string> = {
    // Logger
    "logger/logger":
      "const noop = () => {}; const logger = { info: noop, warn: noop, error: noop, debug: noop, trace: noop, fatal: noop, child: () => logger }; export default logger;",
    // Text extraction
    "types/shared/text_extraction/index":
      "export const pagePrefixesPerMimeType = {}; export const isTextExtractionSupportedContentType = () => false; export class TextExtraction { constructor() {} fromStream() { throw new Error('Not available in browser'); } }",
    // Structured data
    "types/shared/utils/structured_data":
      "export class InvalidStructuredDataHeaderError extends Error {} export const getSanitizedHeaders = () => { throw new Error('Not available in browser'); }; export const guessDelimiter = async () => undefined; export const parseAndStringifyCsv = async () => { throw new Error('Not available in browser'); };",
  };

  return {
    name: "stub-server-modules",
    enforce: "pre",
    resolveId(id) {
      if (id in stubs) {
        return `\0virtual:${id}`;
      }
      return null;
    },
    load(id) {
      // Handle virtual modules
      if (id.startsWith("\0virtual:")) {
        const moduleId = id.slice("\0virtual:".length);
        return stubs[moduleId];
      }
      // Handle resolved file paths
      for (const [pathSuffix, stub] of Object.entries(filePathStubs)) {
        if (id.endsWith(pathSuffix + ".ts") || id.endsWith(pathSuffix)) {
          return stub;
        }
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const fileEnv = loadEnv(mode, process.cwd(), "");

  // Merge with process.env to include shell environment variables (for build scripts)
  const env = { ...fileEnv, ...process.env };

  // Map NEXT_PUBLIC_* env vars to process.env.NEXT_PUBLIC_* for compatibility
  const envVarDefines: Record<string, string> = {};
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      envVarDefines[`process.env.${key}`] = JSON.stringify(env[key]);
    }
    // Also define VITE_* vars for import.meta.env (ensures shell vars are included)
    if (key.startsWith("VITE_")) {
      envVarDefines[`import.meta.env.${key}`] = JSON.stringify(env[key]);
    }
  }

  // Base path for the app (e.g., "/prefix" to serve at localhost:3010/prefix/...)
  const basePath = env.VITE_BASE_PATH ?? "/";

  return {
    base: basePath,
    root: path.resolve(__dirname, "app"),
    plugins: [stubModulesPlugin(), react()],
    define: {
      ...envVarDefines,
      // Fallback for any remaining process.env access
      "process.env": {},
    },
    server: {
      port: 3010,
      // No proxy - client calls API directly using VITE_DUST_CLIENT_FACING_URL
      fs: {
        // Allow serving files from the full front directory
        allow: [path.resolve(__dirname, ".")],
      },
    },
    resolve: {
      // Use array format for aliases to ensure proper ordering (most specific first)
      alias: [
        // Platform abstraction: use SPA implementation instead of Next.js
        {
          find: "@app/lib/platform",
          replacement: path.resolve(__dirname, "lib/platform/spa.ts"),
        },
        // General @app alias
        { find: "@app", replacement: path.resolve(__dirname, "./") },
        // Resolve SDK dependencies from front's node_modules
        {
          find: "eventsource-parser",
          replacement: path.resolve(
            __dirname,
            "node_modules/eventsource-parser"
          ),
        },
        {
          find: "event-source-polyfill",
          replacement: path.resolve(
            __dirname,
            "node_modules/event-source-polyfill"
          ),
        },
        {
          find: "zod",
          replacement: path.resolve(__dirname, "node_modules/zod"),
        },
      ],
      dedupe: ["react", "react-dom"],
    },
    build: {
      outDir: path.resolve(__dirname, "app/dist"),
      sourcemap: true,
    },
  };
});
