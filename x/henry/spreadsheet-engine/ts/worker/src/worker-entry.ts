// Browser worker entry: load the web wasm build, wire the server to
// self.postMessage. Bundlers consume this via
// `new Worker(new URL("./worker-entry", import.meta.url), { type: "module" })`.

import type { EngineRequest, EngineResponse } from "@dust/sheet-engine-client/protocol";

import init, * as wasm from "../wasm/web/engine.js";
import { createEngineServer, type EngineWasm } from "./engine-server";

function post(response: EngineResponse): void {
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage(response);
}

// Compile-checked against the server's expected surface: a wasm-bindgen
// signature change becomes a build error here, not a runtime surprise.
const wasmModule: EngineWasm = wasm;

const ready: Promise<ReturnType<typeof createEngineServer>> = init().then(() =>
  createEngineServer({ wasm: wasmModule, post }),
);

self.addEventListener("message", (event) => {
  const request = (event as MessageEvent).data as EngineRequest;
  ready.then(
    (server) => server.handle(request),
    // Wasm fetch/compile failure: without this every caller hangs forever.
    (initError: unknown) => {
      if (typeof request === "object" && request !== null && typeof request.id === "number") {
        post({
          id: request.id,
          kind: "error",
          error: { code: "INTERNAL", detail: `engine failed to initialize: ${String(initError)}` },
        });
      }
    },
  );
});
