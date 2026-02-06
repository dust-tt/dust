import react from "@vitejs/plugin-react";
import path from "path";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";

const apps = {
  app: {
    assets: [["share.html", "_share/index.html"]], // underscore prefix avoids Pretty URLs conflict
    inputs: {
      main: path.resolve(__dirname, "index.html"),
      share: path.resolve(__dirname, "share.html"),
    },
    serveMapping: (url: string | undefined) => {
      if (url?.startsWith("/share")) {
        return "/share.html";
      }
      return "/index.html";
    },
    port: 3011,
  },
  poke: {
    assets: [["poke.html", "index.html"]],
    inputs: {
      main: path.resolve(__dirname, "poke.html"),
    },
    serveMapping: () => {
      return "/poke.html";
    },
    port: 3010,
  },
};

// Virtual module plugin to stub out server-side only modules
function stubModulesPlugin(): Plugin {
  const stubs: Record<string, string> = {
    // Stream: minimal stub for Node.js stream module
    stream:
      "export class Readable { pipe() { return this; } on() { return this; } once() { return this; } destroy() {} } export class Writable { write() { return true; } end() {} on() { return this; } once() { return this; } } export class Transform extends Readable {} export class Duplex extends Readable { write() { return true; } end() {} } export default { Readable, Writable, Transform, Duplex };",
    // Buffer: minimal stub for Node.js Buffer
    buffer:
      "export const Buffer = { isBuffer: () => false, from: (x) => new Uint8Array(typeof x === 'string' ? [...x].map(c => c.charCodeAt(0)) : x), alloc: (n) => new Uint8Array(n) }; export default { Buffer };",
    // Assert: minimal stub for Node.js assert module
    assert:
      "function assert(value, message) { if (!value) throw new Error(message || 'Assertion failed'); } assert.ok = assert; assert.strictEqual = (a, b, msg) => { if (a !== b) throw new Error(msg || `Expected ${a} to strictly equal ${b}`); }; assert.deepStrictEqual = assert.strictEqual; export default assert; export { assert };",
    // Crypto: minimal stub for Node.js crypto module (server-only functions)
    crypto:
      "export const createHmac = () => { throw new Error('createHmac is not available in browser'); }; export const timingSafeEqual = () => { throw new Error('timingSafeEqual is not available in browser'); }; export default { createHmac, timingSafeEqual };",
    // Child process: minimal stub for Node.js child_process module
    child_process:
      "export const execSync = () => { throw new Error('execSync is not available in browser'); }; export const exec = () => { throw new Error('exec is not available in browser'); }; export const spawn = () => { throw new Error('spawn is not available in browser'); }; export default { execSync, exec, spawn };",
  };

  // Stubs for resolved file paths (after @dust-tt/front alias is applied)
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

// Plugin to inject react-scan script in development mode
function reactScanPlugin(enabled: boolean): Plugin {
  return {
    name: "react-scan",
    transformIndexHtml(html) {
      if (!enabled) {
        return html;
      }
      // Inject react-scan script at the beginning of <head>
      return html.replace(
        "<head>",
        `<head>
    <script src="https://unpkg.com/react-scan/dist/auto.global.js"></script>`
      );
    },
  };
}

// Plugin to organize multi-entry HTML output into subdirectories
function organizeMultiEntryOutputPlugin(
  appDefinition: typeof apps.poke | typeof apps.app
): Plugin {
  const { assets } = appDefinition;

  return {
    name: "organize-multi-entry-output",
    enforce: "post",
    generateBundle(_, bundle) {
      // Move poke.html to index.html
      assets.forEach(([source, target]) => {
        const asset = bundle[source];
        if (asset) {
          asset.fileName = target;
          delete bundle[source];
          bundle[target] = asset;
        }
      });
    },
  };
}

// Plugin to serve the correct HTML file in dev mode (SPA fallback)
function serveHtmlPlugin(
  appDefinition: typeof apps.poke | typeof apps.app
): Plugin {
  return {
    name: "serve-html",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // Skip requests for actual files (assets, HMR, source files, etc.)
        if (
          req.url?.startsWith("/@") ||
          req.url?.startsWith("/node_modules") ||
          req.url?.startsWith("/src") ||
          req.url?.match(/\.\w+(\?|$)/)
        ) {
          return next();
        }

        req.url = appDefinition.serveMapping(req.url);

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const fileEnv = loadEnv(mode, process.cwd(), "");

  // Merge with process.env to include shell environment variables (for build scripts)
  const env = { ...fileEnv, ...process.env };

  // Determine which app to build: "poke" or "app" (default: "app")
  const appName = env.VITE_APP_NAME ?? "app";
  const appDefinition = apps[appName];

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

  // Base path for the app (set via VITE_BASE_PATH env var from build script)
  const basePath = env.VITE_BASE_PATH ?? "/";

  const enableReactScan =
    mode === "development" && env.VITE_REACT_SCAN === "true";

  return {
    base: basePath,
    root: path.resolve(__dirname, "."),
    publicDir: path.resolve(__dirname, "../front/public"),
    plugins: [
      stubModulesPlugin(),
      serveHtmlPlugin(appDefinition),
      organizeMultiEntryOutputPlugin(appDefinition),
      reactScanPlugin(enableReactScan),
      react(),
    ],
    define: {
      ...envVarDefines,
      // Fallback for any remaining process.env access
      "process.env": {},
    },
    server: {
      port: appDefinition.port,
      // No proxy - client calls API directly using VITE_DUST_CLIENT_FACING_URL
      fs: {
        // Allow serving files from the front directory (for shared code)
        allow: [
          path.resolve(__dirname, "."),
          path.resolve(__dirname, "../front"),
          path.resolve(__dirname, "../node_modules"),
        ],
      },
    },
    resolve: {
      // Use array format for aliases to ensure proper ordering (most specific first)
      alias: [
        // @spa alias for local SPA source files
        {
          find: "@spa",
          replacement: path.resolve(__dirname, "src"),
        },
        // Platform abstraction: redirect @app/lib/platform to SPA implementation
        {
          find: "@app/lib/platform",
          replacement: path.resolve(__dirname, "src/lib/platform.tsx"),
        },
        // @app alias for front internal imports
        {
          find: "@app",
          replacement: path.resolve(__dirname, "../front"),
        },
        // @dust-tt/front maps to the front workspace
        {
          find: "@dust-tt/front",
          replacement: path.resolve(__dirname, "../front"),
        },
        // Resolve SDK dependencies from root node_modules (hoisted by npm workspaces)
        {
          find: "eventsource-parser",
          replacement: path.resolve(
            __dirname,
            "../node_modules/eventsource-parser"
          ),
        },
        // Handle zod and its subpath imports (e.g., zod/v3)
        {
          find: /^zod(\/.*)?$/,
          replacement: path.resolve(__dirname, "../node_modules/zod$1"),
        },
      ],
      dedupe: ["react", "react-dom"],
    },
    build: {
      outDir: path.resolve(__dirname, `dist/${appName}`),
      sourcemap: true,
      rollupOptions: {
        input: appDefinition.inputs,
      },
    },
  };
});
