import react from "@vitejs/plugin-react";
import { createRequire } from "module";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import type { Plugin, PluginOption } from "vite";
import { defineConfig, loadEnv } from "vite";

const require = createRequire(import.meta.url);

const apps = {
  app: {
    assets: [
      ["share.html", "share/index.html"],
      ["oauth.html", "oauth/index.html"],
      ["email.html", "email/index.html"],
    ],
    inputs: {
      main: path.resolve(__dirname, "index.html"),
      share: path.resolve(__dirname, "share.html"),
      oauth: path.resolve(__dirname, "oauth.html"),
      email: path.resolve(__dirname, "email.html"),
    },
    serveMapping: (url: string | undefined) => {
      if (url?.startsWith("/share")) {
        return "/share.html";
      }
      if (url?.startsWith("/oauth/") || url?.match(/^\/w\/[^/]+\/oauth\//)) {
        return "/oauth.html";
      }
      if (url?.startsWith("/email")) {
        return "/email.html";
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
// Detects server-only imports leaking into the SPA bundle.
// Fails the build if a Node.js builtin or server-only module is imported.
function detectServerImportsPlugin(): Plugin {
  const NODE_BUILTINS = new Set([
    "assert",
    "buffer",
    "child_process",
    "crypto",
    "dns",
    "fs",
    "http",
    "http2",
    "https",
    "net",
    "os",
    "path",
    "stream",
    "tls",
    "worker_threads",
    "zlib",
  ]);

  const SERVER_ONLY_PATTERNS = [
    /\/front\/temporal\//,
    /\/front\/lib\/resources\//,
  ];

  // Known exceptions that are tolerated.
  // Each entry should have a comment explaining why it's allowed.
  const ALLOWED = new Set([
    // string_ids.ts is imported by many SPA files and lives in the server-only resources pattern.
    // The blake3-dependent functions (generateRandomModelSId, generateSecureSecret) have been
    // moved to string_ids_server.ts which is not imported from the SPA.
    "front/lib/resources/string_ids.ts",
    // run.ts uses fs/path for Dust app execution. Only imported transitively, never called in SPA.
    "fs",
    "path",
    // Buffer is used by sdks/js (client.esm.js) for file download. Shimmed via globalThis.Buffer in HTML.
    "buffer",
  ]);

  const violations = new Map<string, Set<string>>();

  function addViolation(mod: string, importer: string | undefined) {
    const importers = violations.get(mod) ?? new Set();
    if (importer) {
      importers.add(importer.replace(/.*\/front\//, "front/"));
    }
    violations.set(mod, importers);
  }

  // Runtime global shim for Node.js Buffer API used by sdks/js at runtime.
  const bufferShim = `<script>
      globalThis.Buffer = globalThis.Buffer || {
        isBuffer: function () { return false; },
        from: function (x) {
          return new Uint8Array(
            typeof x === "string"
              ? Array.from(x).map(function (c) { return c.charCodeAt(0); })
              : x
          );
        },
        alloc: function (n) { return new Uint8Array(n); },
      };
    </script>`;

  return {
    name: "detect-server-imports",
    enforce: "pre",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    ${bufferShim}`);
    },
    resolveId(id, importer) {
      if (NODE_BUILTINS.has(id) || NODE_BUILTINS.has(id.replace("node:", ""))) {
        addViolation(id, importer);
      }
      return null;
    },
    transform(_code, id) {
      for (const pattern of SERVER_ONLY_PATTERNS) {
        if (pattern.test(id)) {
          addViolation(id.replace(/.*\/front\//, "front/"), undefined);
        }
      }
      return null;
    },
    buildEnd() {
      const newViolations = new Map<string, Set<string>>();
      for (const [mod, importers] of violations) {
        if (!ALLOWED.has(mod)) {
          newViolations.set(mod, importers);
        }
      }
      if (newViolations.size > 0) {
        const lines = [
          `${newViolations.size} server-only module(s) detected in SPA build:`,
        ];
        for (const [mod, importers] of newViolations) {
          const importerList = [...importers].join(", ");
          lines.push(
            `  ${mod}${importerList ? ` (imported by: ${importerList})` : ""}`
          );
        }
        lines.push(
          "Server-only code has leaked into the SPA. Split the offending file to separate server and client concerns.",
          "If this is intentional, add the module to the ALLOWED set in detectServerImportsPlugin()."
        );
        this.error(lines.join("\n"));
      }
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
        // Strip query string to check only the path portion.
        const urlPath = req.url?.split("?")[0] ?? "";

        // Skip requests for actual files (assets, HMR, source files, etc.)
        if (
          urlPath.startsWith("/@") ||
          urlPath.startsWith("/node_modules") ||
          urlPath.startsWith("/src") ||
          urlPath.match(/\.\w+$/)
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
  if (appName !== "poke" && appName !== "app") {
    throw new Error(`Invalid app name: ${appName}`);
  }

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

  const enableAnalyzer = env.ANALYZE === "true";
  type AnalyzerTemplate =
    | "treemap"
    | "sunburst"
    | "network"
    | "raw-data"
    | "list";
  const isAnalyzerTemplate = (value: string): value is AnalyzerTemplate =>
    ["treemap", "sunburst", "network", "raw-data", "list"].includes(value);
  const templateValue = env.ANALYZE_TEMPLATE ?? "treemap";
  const analyzerTemplate: AnalyzerTemplate = isAnalyzerTemplate(templateValue)
    ? templateValue
    : "treemap";

  return {
    cacheDir: path.resolve(__dirname, ".vite"),
    base: basePath,
    root: path.resolve(__dirname, "."),
    publicDir: path.resolve(__dirname, "../front/public"),
    plugins: [
      detectServerImportsPlugin(),
      serveHtmlPlugin(appDefinition),
      organizeMultiEntryOutputPlugin(appDefinition),
      reactScanPlugin(enableReactScan),
      react(),
      enableAnalyzer &&
        visualizer({
          open: true,
          filename: `dist/${appName}/stats.html`,
          template: analyzerTemplate,
          gzipSize: true,
          brotliSize: true,
        }),
    ].flat() as PluginOption[],
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
        // Logger: redirect server-side pino logger to browser-safe Datadog logger
        {
          find: "@app/logger/logger",
          replacement: path.resolve(
            __dirname,
            "../front/logger/datadogLogger.ts"
          ),
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
          replacement: path.dirname(
            require.resolve("eventsource-parser/package.json")
          ),
        },
        // Handle zod and its subpath imports (e.g., zod/v3)
        {
          find: /^zod(\/.*)?$/,
          replacement: path.dirname(require.resolve("zod/package.json")) + "$1",
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
