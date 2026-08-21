// Boots the built server and fails if a browser-only package is loaded on the
// way. These packages have all been pulled into the boot path at some point by
// a single value import from a server module, and each one costs startup time
// on every pod. A lint rule catches the direct imports; this catches the
// transitive ones, and prints the chain that pulled the package in.
//
//   node --require ./scripts/boot-check.cjs dist/server.js
const Module = require("node:module");

const FORBIDDEN = [
  "@datadog/browser-core",
  "@datadog/browser-logs",
  "@datadog/browser-rum",
  "@dust-tt/sparkle",
  "@tiptap/react",
  "next",
  "posthog-js",
  "react-dom",
  "swr",
];

const BOOT_TIMEOUT_MS = 180_000;

function isForbidden(request) {
  return FORBIDDEN.some((pkg) => request === pkg || request.startsWith(`${pkg}/`));
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (isForbidden(request)) {
    const chain = [];
    let m = parent;
    while (m && m.filename) {
      chain.push(m.filename);
      m = m.parent;
    }
    throw new Error(
      `boot-check: "${request}" is browser-only and must not load during boot.\n` +
        `Importer chain:\n  ${chain.join("\n  ")}`
    );
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const timeout = setTimeout(() => {
  process.stderr.write(`boot-check: server did not start within ${BOOT_TIMEOUT_MS}ms\n`);
  process.exit(1);
}, BOOT_TIMEOUT_MS);

const write = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, ...args) {
  const result = write(chunk, ...args);
  if (typeof chunk === "string" && chunk.includes("server listening")) {
    clearTimeout(timeout);
    process.stderr.write(`boot-check: ok, none of ${FORBIDDEN.length} browser packages loaded\n`);
    process.exit(0);
  }
  return result;
};
