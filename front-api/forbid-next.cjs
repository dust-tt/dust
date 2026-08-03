// Runtime guard for the pure-Hono server. Throws if anything tries to load
// the `next` package (or a subpath), proving that nothing in the import
// graph pulls in Next.js. Wired in via NODE_OPTIONS=--require=./forbid-next.cjs
// for the `front-api-hono` mprocs/process-compose process.
const Module = require("node:module");

const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "next" || request.startsWith("next/")) {
    const chain = [];
    let m = parent;
    while (m && m.filename) {
      chain.push(m.filename);
      m = m.parent;
    }
    throw new Error(
      `forbid-next: attempted to load "${request}". Importer chain:\n  ` +
        chain.join("\n  ") +
        "\nNext.js must not be pulled in by the pure-Hono server."
    );
  }
  return originalResolve.call(this, request, parent, ...rest);
};
