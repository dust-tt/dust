import { createRequire } from "node:module";
import path from "node:path";

import { LINGUI_MACRO_BABEL_OPTIONS } from "./lingui-macro.mjs";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

// Dev fronts that may embed viz. dust-hive envs run on other ports and list them in
// ALLOWED_VISUALIZATION_ORIGIN (the same variable the content page checks), so include those too.
const DEV_FRAME_ANCESTORS = [
  "http://localhost:3000",
  "http://localhost:3011",
  "http://localhost:3012",
  "chrome-extension://okjldflokifdjecnhbmkdanjjbnmlihg",
  ...(process.env.ALLOWED_VISUALIZATION_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const PROD_FRAME_ANCESTORS = [
  "https://dust.tt",
  "https://app.dust.tt",
  "https://eu.dust.tt",
  "https://front-edge.dust.tt",
  "https://eu.front-edge.dust.tt",
  "https://*.preview.dust.tt",
  "chrome-extension://okjldflokifdjecnhbmkdanjjbnmlihg",
  "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
];

const FRAME_ANCESTORS = [
  ...new Set(isDev ? DEV_FRAME_ANCESTORS : PROD_FRAME_ANCESTORS),
].join(" ");

const CONTENT_SECURITY_POLICIES = `connect-src 'self'; media-src 'self'; frame-ancestors 'self' https://app.frontapp.com ${FRAME_ANCESTORS} moz-extension:;`;

// Runs before next-swc-loader, which compiles the TS and JSX the macros leave behind.
const linguiMacroLoader = {
  loader: require.resolve("babel-loader"),
  options: { ...LINGUI_MACRO_BABEL_OPTIONS, cacheDirectory: true },
};

const nextConfig = {
  webpack(config) {
    //`enforce: "pre"` runs the macro pass before Next's SWC loader.
    config.module.rules.push({
      enforce: "pre",
      test: /\.(ts|tsx)$/,
      include: ["app", "components", "hooks", "lib"].map((dir) =>
        path.resolve(import.meta.dirname, dir)
      ),
      use: [linguiMacroLoader],
    });
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: isDev ? "http://localhost:3000" : "https://dust.tt",
          },
          {
            key: "Content-Security-Policy",
            value: CONTENT_SECURITY_POLICIES,
          },
        ],
      },
      // Allow CORS for static files.
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      // Sandboxed Frames have an opaque origin even when fetching this public report.
      {
        source: "/tailwind-coverage.json",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
